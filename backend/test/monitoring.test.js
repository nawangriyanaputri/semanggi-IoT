const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const readingsPath = path.join(os.tmpdir(), `sppg-monitor-${process.pid}.json`);
process.env.DATA_MODE = "live";
process.env.DEVICE_API_KEY = "test-device-api-key-for-monitoring";
process.env.READINGS_FILE = readingsPath;

const { routeRequest } = require("../src/routes");

before(async () => {
  await fs.rm(readingsPath, { force: true });
});

after(async () => {
  await fs.rm(readingsPath, { force: true });
});

test("requires a configured device key for sensor uploads", async () => {
  await assert.rejects(
    routeRequest("POST", "/api/monitoring/readings", {}, new URLSearchParams(), "wrong-key"),
    { status: 401 }
  );
});

test("validates sensor values before storing them", async () => {
  await assert.rejects(
    routeRequest("POST", "/api/monitoring/readings", {
      deviceId: "ruang-1",
      temperature: 120,
      humidity: 50
    }, new URLSearchParams(), process.env.DEVICE_API_KEY),
    { status: 400 }
  );
});

test("returns null for the latest reading when no sensor data has arrived", async () => {
  const latest = await routeRequest("GET", "/api/monitoring/latest");
  assert.equal(latest, null);
});

test("stores real readings for latest, history, trends, and device status", async () => {
  const reading = await routeRequest("POST", "/api/monitoring/readings", {
    deviceId: "ruang-1",
    temperature: 5.25,
    humidity: 68
  }, new URLSearchParams(), process.env.DEVICE_API_KEY);

  assert.equal(reading.temperature, 5.25);
  assert.equal(reading.humidity, 68);
  assert.equal(reading.source, "ESP32 · ruang-1");

  const latest = await routeRequest("GET", "/api/monitoring/latest");
  assert.deepEqual(latest, reading);
  assert.deepEqual(await routeRequest("GET", "/api/monitoring/history"), [reading]);
  assert.deepEqual(await routeRequest("GET", "/api/monitoring/history/export"), [reading]);

  const now = new Date(reading.timestamp);
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const trend = await routeRequest(
    "GET",
    "/api/monitoring/trend",
    undefined,
    new URLSearchParams({ from: date, to: date })
  );
  assert.deepEqual(trend, [reading]);

  const health = await routeRequest("GET", "/api/health");
  assert.equal(health.dataMode, "live");
  assert.equal(health.deviceStatus, "online");
});

test("queues a one-minute buzzer mute for an authenticated device", async () => {
  await assert.rejects(
    routeRequest(
      "GET",
      "/api/device/buzzer",
      undefined,
      new URLSearchParams(),
      "wrong-key"
    ),
    { status: 401 }
  );

  const command = await routeRequest(
    "POST",
    "/api/buzzer/mute",
    undefined,
    new URLSearchParams(),
    undefined,
    "127.0.0.1"
  );
  assert.equal(command.durationMs, 60_000);

  const state = await routeRequest(
    "GET",
    "/api/device/buzzer",
    undefined,
    new URLSearchParams(),
    process.env.DEVICE_API_KEY
  );
  assert.equal(state.muteUntil, command.muteUntil);
  assert.ok(state.remainingMs > 0 && state.remainingMs <= command.durationMs);
});

test("rejects buzzer mute requests from non-loopback clients", async () => {
  await assert.rejects(
    routeRequest(
      "POST",
      "/api/buzzer/mute",
      undefined,
      new URLSearchParams(),
      undefined,
      "192.168.1.20"
    ),
    { status: 403 }
  );
});
