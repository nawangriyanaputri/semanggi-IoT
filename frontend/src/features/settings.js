import { getSettings, saveSettings } from "../api.js";

let currentSettings;

function renderSettings() {
  document.querySelector("#temp-range").textContent = `${currentSettings.tempMin}–${currentSettings.tempMax} °C`;
  document.querySelector("#humidity-range").textContent =
    `${currentSettings.humidityMin}–${currentSettings.humidityMax} %RH`;
  document.querySelectorAll("#settings-form input").forEach(input => {
    input.value = currentSettings[input.name];
  });
}

function validateSettings(settings) {
  return Object.values(settings).every(Number.isFinite) &&
    settings.tempMin < settings.tempMax &&
    settings.humidityMin >= 0 &&
    settings.humidityMin < settings.humidityMax &&
    settings.humidityMax <= 100;
}

export function getCurrentSettings() {
  if (!currentSettings) throw new Error("Pengaturan belum dimuat dari backend.");
  return currentSettings;
}

export async function initializeSettings() {
  currentSettings = await getSettings();
  renderSettings();

  document.querySelector("#settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#save-message");
    message.textContent = "";
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    if (!validateSettings(next)) {
      message.textContent = "Periksa kembali rentang nilai.";
      return;
    }

    try {
      currentSettings = await saveSettings(next);
      renderSettings();
      window.dispatchEvent(new Event("settings:updated"));
      message.textContent = "Pengaturan tersimpan di backend.";
    } catch (error) {
      console.error("Gagal menyimpan pengaturan.", error);
      message.textContent = error.message;
    }
  });
}
