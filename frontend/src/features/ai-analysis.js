import { getAnalysis } from "../api.js";

export async function initializeAiAnalysis() {
  const analysis = await getAnalysis();
  document.querySelector("#prediction-temperature").textContent = analysis.temperature;
  document.querySelector("#prediction-humidity").textContent = analysis.humidity;
  document.querySelector("#prediction-temperature-trend").textContent = analysis.temperatureTrend;
  document.querySelector("#prediction-humidity-trend").textContent = analysis.humidityTrend;
  document.querySelector("#ai-explanation").textContent = analysis.description;
  document.querySelector("#recommendation").textContent = analysis.recommendation;
}
