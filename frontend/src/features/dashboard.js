import { getLatest, muteBuzzer } from "../api.js";
import { getCurrentSettings } from "./settings.js";

let latest;

function renderDashboard(reading) {
  latest = reading;
  if (!reading) {
    document.querySelectorAll("[data-temperature], [data-humidity]").forEach(element => {
      element.textContent = "—";
    });
    document.querySelector("#last-update").textContent = "Belum ada data";
    document.querySelector("#condition").textContent = "Menunggu Data";
    document.querySelector("#condition").style.color = "var(--muted)";
    document.querySelector("#condition").previousElementSibling.style.background = "var(--muted)";
    document.querySelector("#warning-message").textContent =
      "Belum ada pembacaan sensor. Pastikan ESP32 aktif dan mengirim data ke backend.";
    return;
  }
  document.querySelectorAll("[data-temperature]").forEach(element => {
    element.textContent = reading.temperature;
  });
  document.querySelectorAll("[data-humidity]").forEach(element => {
    element.textContent = reading.humidity;
  });
  document.querySelector("#last-update").textContent =
    new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(reading.timestamp));

  const settings = getCurrentSettings();
  const safe = reading.temperature >= settings.tempMin && reading.temperature <= settings.tempMax &&
    reading.humidity >= settings.humidityMin && reading.humidity <= settings.humidityMax;
  const condition = document.querySelector("#condition");
  condition.textContent = safe ? "Aman" : "Perlu Perhatian";
  condition.style.color = safe ? "var(--green)" : "var(--orange)";
  condition.previousElementSibling.style.background = safe ? "var(--green)" : "var(--orange)";
  document.querySelector("#warning-message").textContent = safe
    ? "Tidak ada peringatan aktif. Seluruh parameter berada dalam rentang yang ditentukan."
    : "Suhu atau kelembapan berada di luar batas parameter. Periksa kondisi ruang penyimpanan.";
}

export async function initializeDashboard() {
  latest = await getLatest();
  renderDashboard(latest);
  const muteButton = document.querySelector("#mute-buzzer");
  const muteStatus = document.querySelector("#buzzer-mute-status");
  muteButton.addEventListener("click", async () => {
    muteButton.disabled = true;
    muteStatus.textContent = "Mengirim perintah senyap…";
    try {
      const result = await muteBuzzer();
      const minutes = Math.ceil(result.durationMs / 60_000);
      muteStatus.textContent =
        `Perintah dikirim. Buzzer akan senyap selama ${minutes} menit saat ESP32 menerimanya.`;
    } catch (error) {
      console.error("Gagal mengirim perintah senyap buzzer.", error);
      muteStatus.textContent = `Perintah gagal: ${error.message}`;
    } finally {
      muteButton.disabled = false;
    }
  });
  window.addEventListener("settings:updated", () => renderDashboard(latest));
  window.setInterval(async () => {
    try {
      renderDashboard(await getLatest());
    } catch (error) {
      console.error("Gagal memperbarui pembacaan sensor.", error);
    }
  }, 10_000);
}
