const { getPrediction } = require("./features/analysis");
const { dataMode, getHistory, getLatest, getStatus, getTrend, saveReading } = require("./features/monitoring");
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

async function routeRequest(method, pathname, body, searchParams, deviceKey) {
  if (method === "GET" && pathname === "/api/health") {
    return { status: "ok", service: "sppg-monitor-api", ...await getStatus() };
  }
  if (method === "POST" && pathname === "/api/monitoring/readings") {
    authorizeDevice(deviceKey);
    return saveReading(body);
  }
  if (method === "GET" && pathname === "/api/monitoring/latest") {
    return getLatest();
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
    return updateSettings(body);
  }
  return undefined;
}

module.exports = { routeRequest };
