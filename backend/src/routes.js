const { getPrediction } = require("./features/analysis");
const { getBuzzerMuteState, requestBuzzerMute } = require("./features/buzzer");
const { dataMode, getAllHistory, getHistory, getLatest, getStatus, getTrend, saveReading } = require("./features/monitoring");
const { getSettings, updateSettings } = require("./features/settings");
const { timingSafeEqual } = require("node:crypto");

function authorizeDevice(suppliedKey) {
  const expectedKey = process.env.DEVICE_API_KEY;
  if (!expectedKey) {
    throw Object.assign(new Error("DEVICE_API_KEY belum dikonfigurasi pada backend."), { status: 503 });
  }
  if (expectedKey.length < 24) {
    throw Object.assign(new Error("DEVICE_API_KEY harus memiliki minimal 24 karakter."), { status: 503 });
  }
  const supplied = typeof suppliedKey === "string" ? Buffer.from(suppliedKey) : Buffer.alloc(0);
  const expected = Buffer.from(expectedKey);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw Object.assign(new Error("Kunci perangkat tidak valid."), { status: 401 });
  }
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1";
}

async function routeRequest(method, pathname, body, searchParams, deviceKey, remoteAddress) {
  if (method === "GET" && pathname === "/api/health") {
    return { status: "ok", service: "sppg-monitor-api", ...await getStatus() };
  }
  if (method === "POST" && pathname === "/api/monitoring/readings") {
    authorizeDevice(deviceKey);
    return saveReading(body);
  }
  if (method === "GET" && pathname === "/api/device/buzzer") {
    authorizeDevice(deviceKey);
    return getBuzzerMuteState();
  }
  if (method === "POST" && pathname === "/api/buzzer/mute") {
    if (!isLoopbackAddress(remoteAddress)) {
      throw Object.assign(new Error("Perintah buzzer hanya dapat dikirim dari komputer backend."), { status: 403 });
    }
    if (dataMode !== "live") {
      throw Object.assign(new Error("Perintah buzzer hanya tersedia pada mode live."), { status: 409 });
    }
    return requestBuzzerMute();
  }
  if (method === "GET" && pathname === "/api/monitoring/latest") {
    return getLatest();
  }
  if (method === "GET" && pathname === "/api/monitoring/history/export") {
    return getAllHistory();
  }
  if (method === "GET" && pathname === "/api/monitoring/history") {
    return getHistory();
  }
  if (method === "GET" && pathname === "/api/monitoring/trend") {
    return getTrend(searchParams.get("from"), searchParams.get("to"));
  }
  if (method === "GET" && pathname === "/api/analysis/prediction") {
    return getPrediction();
  }
  if (method === "GET" && pathname === "/api/settings") {
    return getSettings();
  }
  if (method === "PUT" && pathname === "/api/settings") {
    if (!isLoopbackAddress(remoteAddress)) {
      throw Object.assign(new Error("Pengaturan hanya dapat diubah dari komputer backend."), { status: 403 });
    }
    return updateSettings(body);
  }
  return undefined;
}

module.exports = { routeRequest };
