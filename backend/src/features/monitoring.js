const fs = require("node:fs/promises");
const path = require("node:path");

const dataMode = process.env.DATA_MODE || "simulation";
if (!["simulation", "live"].includes(dataMode)) {
  throw new Error("DATA_MODE harus bernilai 'simulation' atau 'live'.");
}

const readingsPath = process.env.READINGS_FILE ||
  path.join(__dirname, "..", "..", "data", "readings.json");
const maxReadings = 20_000;
const maxHistoryResponse = 500;
const offlineAfterMs = Number(process.env.DEVICE_OFFLINE_AFTER_MS || 360_000);
if (!Number.isFinite(offlineAfterMs) || offlineAfterMs <= 0) {
  throw new Error("DEVICE_OFFLINE_AFTER_MS harus berupa angka positif.");
}

const simulatedSource = "ESP32 · DHT11 (simulasi)";
const simulatedLatest = {
  temperature: 5.2,
  humidity: 68,
  timestamp: new Date().toISOString(),
  source: simulatedSource
};
const simulatedHistory = [
  { temperature: 5.2, humidity: 68, minutesAgo: 0 },
  { temperature: 5.1, humidity: 69, minutesAgo: 30 },
  { temperature: 5.3, humidity: 67, minutesAgo: 60 },
  { temperature: 5.4, humidity: 68, minutesAgo: 90 },
  { temperature: 5.0, humidity: 71, minutesAgo: 120 },
  { temperature: 5.2, humidity: 66, minutesAgo: 150 }
].map(reading => ({
  temperature: reading.temperature,
  humidity: reading.humidity,
  timestamp: new Date(Date.now() - reading.minutesAgo * 60_000).toISOString(),
  source: simulatedSource
}));

let readingsCache;
let writeQueue = Promise.resolve();

async function readReadings() {
  if (readingsCache) return readingsCache;
  try {
    const stored = JSON.parse(await fs.readFile(readingsPath, "utf8"));
    if (!Array.isArray(stored) || stored.some(reading =>
      !Number.isFinite(reading.temperature) ||
      !Number.isFinite(reading.humidity) ||
      typeof reading.timestamp !== "string" ||
      typeof reading.source !== "string")) {
      throw new Error(`Format file pembacaan sensor tidak valid: ${readingsPath}`);
    }
    readingsCache = stored.slice(-maxReadings);
  } catch (error) {
    if (error.code === "ENOENT") {
      readingsCache = [];
      return readingsCache;
    }
    throw error;
  }
  return readingsCache;
}

function parseReading(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("Body harus berupa objek JSON."), { status: 400 });
  }
  const { temperature, humidity } = input;
  if (!Number.isFinite(temperature) || temperature < -40 || temperature > 80) {
    throw Object.assign(new Error("temperature harus berupa angka antara -40 dan 80 °C."), { status: 400 });
  }
  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    throw Object.assign(new Error("humidity harus berupa angka antara 0 dan 100 %RH."), { status: 400 });
  }
  const deviceId = input.deviceId === undefined ? "esp32" : input.deviceId;
  if (typeof deviceId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(deviceId)) {
    throw Object.assign(new Error("deviceId hanya boleh berisi 1–40 huruf, angka, '_' atau '-'."), { status: 400 });
  }
  return {
    temperature: Number(temperature.toFixed(2)),
    humidity: Number(humidity.toFixed(2)),
    timestamp: new Date().toISOString(),
    source: `ESP32 · ${deviceId}`
  };
}

async function saveReading(input) {
  const reading = parseReading(input);
  const operation = writeQueue.then(async () => {
    const readings = await readReadings();
    readings.push(reading);
    readingsCache = readings.slice(-maxReadings);
    await fs.mkdir(path.dirname(readingsPath), { recursive: true });
    const temporaryPath = `${readingsPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(readingsCache)}\n`, "utf8");
    await fs.rename(temporaryPath, readingsPath);
    return reading;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function getLatest() {
  if (dataMode === "simulation") return simulatedLatest;
  const readings = await readReadings();
  return readings.at(-1) || null;
}

async function getHistory() {
  if (dataMode === "simulation") return simulatedHistory;
  const readings = await readReadings();
  return readings.slice(-maxHistoryResponse).reverse();
}

async function getAllHistory() {
  if (dataMode === "simulation") return simulatedHistory;
  const readings = await readReadings();
  return readings.slice().reverse();
}

async function getStatus() {
  const latest = await getLatest();
  const online = latest !== null &&
    Date.now() - Date.parse(latest.timestamp) <= offlineAfterMs;
  return {
    dataMode,
    deviceStatus: dataMode === "simulation"
      ? "simulation"
      : latest === null
        ? "waiting"
        : online
          ? "online"
          : "offline",
    lastReadingAt: latest?.timestamp || null,
    offlineAfterMs
  };
}

function parseDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error(`Tanggal ${field} harus menggunakan format YYYY-MM-DD.`), { status: 400 });
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day) {
    throw Object.assign(new Error(`Tanggal ${field} tidak valid.`), { status: 400 });
  }
  return date.getTime();
}

function getEndOfDate(timestamp) {
  const nextDate = new Date(timestamp);
  nextDate.setDate(nextDate.getDate() + 1);
  return nextDate.getTime() - 1;
}

function filterAndLimit(readings, from, to) {
  const start = parseDate(from, "mulai");
  const endOfRange = getEndOfDate(parseDate(to, "akhir"));
  if (endOfRange < start) {
    throw Object.assign(new Error("Tanggal mulai harus sama dengan atau sebelum tanggal akhir."), { status: 400 });
  }
  const matching = readings.filter(reading => {
    const timestamp = Date.parse(reading.timestamp);
    return timestamp >= start && timestamp <= endOfRange;
  });
  if (matching.length <= maxHistoryResponse) return matching;
  const step = (matching.length - 1) / (maxHistoryResponse - 1);
  return Array.from({ length: maxHistoryResponse }, (_, index) =>
    matching[Math.round(index * step)]);
}

function getSimulatedTrend(from, to) {
  const start = parseDate(from, "mulai");
  const endOfRange = getEndOfDate(parseDate(to, "akhir"));
  const duration = endOfRange - start;
  if (duration < 0) {
    throw Object.assign(new Error("Tanggal mulai harus sama dengan atau sebelum tanggal akhir."), { status: 400 });
  }
  const readings = [];
  const interval = Math.max(3 * 3_600_000, Math.ceil(duration / (199 * 3 * 3_600_000)) * 3 * 3_600_000);
  for (let timestamp = start; timestamp <= endOfRange; timestamp += interval) {
    const phase = (timestamp / 86_400_000) * Math.PI * 2;
    readings.push({
      temperature: Number((5.2 + Math.sin(phase) * 0.6).toFixed(1)),
      humidity: Math.round(68 + Math.cos(phase) * 4),
      timestamp: new Date(timestamp).toISOString(),
      source: simulatedSource
    });
  }
  return readings;
}

async function getTrend(from, to) {
  if (dataMode === "simulation") return getSimulatedTrend(from, to);
  const readings = await readReadings();
  return filterAndLimit(readings, from, to);
}

module.exports = { dataMode, getAllHistory, getHistory, getLatest, getStatus, getTrend, saveReading };
