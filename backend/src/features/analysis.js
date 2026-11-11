function getPrediction() {
  return {
    temperature: 5.4,
    humidity: 67,
    temperatureTrend: "↗ +0.2 °C",
    humidityTrend: "↘ −1 %RH",
    description: "Estimasi demonstrasi berdasarkan pola data contoh. Integrasikan model AI untuk prediksi dari data sensor aktual.",
    recommendation: "Pertahankan sirkulasi udara dan pastikan pintu ruang penyimpanan tertutup rapat.",
    dataMode: "simulation"
  };
}

module.exports = { getPrediction };
