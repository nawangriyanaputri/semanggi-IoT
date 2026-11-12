import { getAnalysis } from "../api.js";

const refreshIntervalMs = 30_000;
let refreshTimer;
let refreshInProgress = false;
let lastSuccessfulUpdateAt;

function renderAnalysis(analysis) {
  const temperature = analysis.temperature === null ? "—" : analysis.temperature.toFixed(1);
  const humidity = analysis.humidity === null ? "—" : analysis.humidity.toFixed(1);
  document.querySelector("#prediction-temperature").textContent = temperature;
  document.querySelector("#prediction-humidity").textContent = humidity;
  document.querySelector("#prediction-temperature-trend").textContent = analysis.temperatureTrend;
  document.querySelector("#prediction-humidity-trend").textContent = analysis.humidityTrend;
  document.querySelector("#ai-explanation").textContent = analysis.description;
  document.querySelector("#recommendation").textContent = analysis.recommendation;
  document.querySelector("#prediction-mode-tag").textContent = analysis.modeLabel;
  document.querySelector("#analysis-mode-tag").textContent = analysis.modeLabel;
  document.querySelector("#analysis-temperature-title").textContent =
    analysis.temperature === null ? "Prediksi suhu belum tersedia" : `Perkiraan suhu: ${temperature} °C`;
  document.querySelector("#analysis-temperature-description").textContent =
    analysis.temperature === null ? analysis.description : `Perubahan terhadap pembacaan terakhir: ${analysis.temperatureTrend}.`;
  document.querySelector("#analysis-humidity-title").textContent =
    analysis.humidity === null ? "Prediksi kelembapan belum tersedia" : `Perkiraan kelembapan: ${humidity} %RH`;
  document.querySelector("#analysis-humidity-description").textContent =
    analysis.humidity === null ? analysis.description : `Perubahan terhadap pembacaan terakhir: ${analysis.humidityTrend}.`;
  document.querySelector("#analysis-recommendation").textContent = analysis.recommendation;
  document.querySelector("#analysis-method").textContent = analysis.description;
}

function showRefreshError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lastUpdated = lastSuccessfulUpdateAt
    ? lastSuccessfulUpdateAt.toLocaleTimeString("id-ID")
    : "belum pernah";
  document.querySelector("#prediction-refresh-status").textContent =
    `Gagal memperbarui: ${message}. Terakhir berhasil: ${lastUpdated}; akan mencoba lagi otomatis.`;
}

async function refreshAiAnalysis() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const analysis = await getAnalysis();
    renderAnalysis(analysis);
    lastSuccessfulUpdateAt = new Date();
    document.querySelector("#prediction-refresh-status").textContent =
      `Diperbarui ${lastSuccessfulUpdateAt.toLocaleTimeString("id-ID")}. Pembaruan otomatis setiap 30 detik.`;
  } catch (error) {
    showRefreshError(error);
    throw error;
  } finally {
    refreshInProgress = false;
  }
}

export async function initializeAiAnalysis() {
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      refreshAiAnalysis().catch(error => {
        console.error("Gagal memperbarui prediksi secara otomatis.", error);
      });
    }, refreshIntervalMs);
  }
  await refreshAiAnalysis();
}
