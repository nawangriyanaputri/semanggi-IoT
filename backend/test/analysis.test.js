const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const readingsPath = path.join(os.tmpdir(), `sppg-analysis-${process.pid}.json`);
process.env.DATA_MODE = "live";
process.env.READINGS_FILE = readingsPath;

const { routeRequest } = require("../src/routes");

before(async () => {
  const now = Date.now();
  const readings = [
    { temperature: 5, humidity: 60, timestamp: new Date(now - 20 * 60_000).toISOString(), source: "ESP32 · test" },
    { temperature: 5.1, humidity: 60.5, timestamp: new Date(now - 10 * 60_000).toISOString(), source: "ESP32 · test" },
    { temperature: 5.2, humidity: 61, timestamp: new Date(now).toISOString(), source: "ESP32 · test" }
  ];
  await fs.writeFile(readingsPath, JSON.stringify(readings), "utf8");
});

after(async () => {
  await fs.rm(readingsPath, { force: true });
});

test("predicts one hour ahead from recent sensor readings", async () => {
  const prediction = await routeRequest("GET", "/api/analysis/prediction");

  assert.equal(prediction.temperature, 5.8);
  assert.equal(prediction.humidity, 64);
  assert.equal(prediction.temperatureTrend, "↗ +0.6 °C");
  assert.equal(prediction.humidityTrend, "↗ +3.0 %RH");
  assert.equal(prediction.sampleCount, 3);
  assert.equal(prediction.status, "ready");
  assert.match(prediction.description, /Regresi linear/);
});
