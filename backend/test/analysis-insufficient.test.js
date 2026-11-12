const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const readingsPath = path.join(os.tmpdir(), `sppg-analysis-insufficient-${process.pid}.json`);
process.env.DATA_MODE = "live";
process.env.READINGS_FILE = readingsPath;

const { routeRequest } = require("../src/routes");

before(async () => {
  const now = Date.now();
  const readings = [
    { temperature: 5, humidity: 60, timestamp: new Date(now - 10 * 60_000).toISOString(), source: "ESP32 · test" },
    { temperature: 5.1, humidity: 60.5, timestamp: new Date(now).toISOString(), source: "ESP32 · test" }
  ];
  await fs.writeFile(readingsPath, JSON.stringify(readings), "utf8");
});

after(async () => {
  await fs.rm(readingsPath, { force: true });
});

test("does not forecast when fewer than three recent readings are available", async () => {
  const prediction = await routeRequest("GET", "/api/analysis/prediction");

  assert.equal(prediction.temperature, null);
  assert.equal(prediction.humidity, null);
  assert.equal(prediction.status, "unavailable");
  assert.equal(prediction.sampleCount, 2);
  assert.match(prediction.description, /minimal 3 pembacaan/);
});
