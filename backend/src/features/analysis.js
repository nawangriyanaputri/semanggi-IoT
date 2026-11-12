const { dataMode, getHistory, getStatus } = require("./monitoring");
const { getSettings } = require("./settings");

const forecastHorizonMs = 60 * 60_000;
const historyWindowMs = 60 * 60_000;
const minimumReadingCount = 3;
const minimumHistorySpanMs = 5 * 60_000;

function linearForecast(readings, field) {
  const points = readings.map(reading => ({
    time: Date.parse(reading.timestamp),
    value: reading[field]
  }));
  const meanTime = points.reduce((sum, point) => sum + point.time, 0) / points.length;
  const meanValue = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const timeVariance = points.reduce((sum, point) =>
    sum + (point.time - meanTime) ** 2, 0);
  const covariance = points.reduce((sum, point) =>
    sum + (point.time - meanTime) * (point.value - meanValue), 0);
  const slopePerMs = timeVariance === 0 ? 0 : covariance / timeVariance;
  const latestTime = points[points.length - 1].time;
  const latestValue = points[points.length - 1].value;
  const projectedValue = meanValue + slopePerMs * (latestTime + forecastHorizonMs - meanTime);
  return { latestValue, projectedValue };
}

function formatTrend(change, unit) {
  if (Math.abs(change) < 0.05) return `→ 0.0 ${unit}`;
  const sign = change > 0 ? "+" : "−";
  return `${change > 0 ? "↗" : "↘"} ${sign}${Math.abs(change).toFixed(1)} ${unit}`;
}

function unavailablePrediction(sampleCount, description, modeLabel) {
  return {
    temperature: null,
    humidity: null,
    temperatureTrend: "Belum tersedia",
    humidityTrend: "Belum tersedia",
    description,
    recommendation: "Tunggu sampai sensor mengirim data yang cukup dan terbaru.",
    dataMode,
    modeLabel,
    sampleCount,
    status: "unavailable"
  };
}

async function getPrediction() {
  const [history, status, settings] = await Promise.all([
    getHistory(),
    getStatus(),
    getSettings()
  ]);
  const modeLabel = dataMode === "simulation" ? "SIMULASI DATA" : "REGRESI DATA SENSOR";

  if (dataMode === "live" && status.deviceStatus !== "online") {
    return unavailablePrediction(0, "Sensor sedang offline atau belum mengirim pembacaan terbaru.", modeLabel);
  }

  const now = Date.now();
  const readings = history
    .filter(reading => {
      const timestamp = Date.parse(reading.timestamp);
      return Number.isFinite(timestamp) &&
        timestamp <= now &&
        timestamp >= now - historyWindowMs &&
        Number.isFinite(reading.temperature) &&
        Number.isFinite(reading.humidity);
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const spanMs = readings.length > 1
    ? Date.parse(readings[readings.length - 1].timestamp) - Date.parse(readings[0].timestamp)
    : 0;

  if (readings.length < minimumReadingCount || spanMs < minimumHistorySpanMs) {
    return unavailablePrediction(
      readings.length,
      `Diperlukan minimal ${minimumReadingCount} pembacaan yang mencakup setidaknya 5 menit; saat ini tersedia ${readings.length}.`,
      modeLabel
    );
  }

  const temperature = linearForecast(readings, "temperature");
  const humidity = linearForecast(readings, "humidity");
  const forecastTemperature = Math.min(80, Math.max(-40, temperature.projectedValue));
  const forecastHumidity = Math.min(100, Math.max(0, humidity.projectedValue));
  const roundedTemperature = Number(forecastTemperature.toFixed(1));
  const roundedHumidity = Number(forecastHumidity.toFixed(1));
  const temperatureOutOfRange =
    roundedTemperature < settings.tempMin || roundedTemperature > settings.tempMax;
  const humidityOutOfRange =
    roundedHumidity < settings.humidityMin || roundedHumidity > settings.humidityMax;
  const durationMinutes = Math.round(spanMs / 60_000);

  let recommendation = "Perkiraan masih berada dalam batas yang diatur. Lanjutkan pemantauan sensor.";
  if (temperatureOutOfRange || humidityOutOfRange) {
    const outOfRange = [];
    if (temperatureOutOfRange) outOfRange.push("suhu");
    if (humidityOutOfRange) outOfRange.push("kelembapan");
    recommendation = `Perkiraan ${outOfRange.join(" dan ")} berada di luar batas yang diatur. Periksa kondisi ruang penyimpanan dan sensor.`;
  }

  return {
    temperature: roundedTemperature,
    humidity: roundedHumidity,
    temperatureTrend: formatTrend(roundedTemperature - temperature.latestValue, "°C"),
    humidityTrend: formatTrend(roundedHumidity - humidity.latestValue, "%RH"),
    description: `Regresi linear dari ${readings.length} pembacaan selama ${durationMinutes} menit terakhir, diproyeksikan 1 jam dari pembacaan terbaru. Ini estimasi statistik, bukan model AI.`,
    recommendation,
    dataMode,
    modeLabel,
    sampleCount: readings.length,
    status: "ready"
  };
}

module.exports = { getPrediction };
