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

  const date = reading.timestamp.slice(0, 10);
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
