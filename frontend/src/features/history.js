import { getHistory } from "../api.js";
import { getCurrentSettings } from "./settings.js";

function renderHistory(readings) {
  const settings = getCurrentSettings();
  const body = document.querySelector("#history-rows");
  const rows = readings.map(reading => {
    const safe = reading.temperature >= settings.tempMin && reading.temperature <= settings.tempMax &&
      reading.humidity >= settings.humidityMin && reading.humidity <= settings.humidityMax;
    const row = document.createElement("tr");
    const values = [
      new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reading.timestamp)),
      `${reading.temperature} °C`,
      `${reading.humidity} %RH`,
      safe ? "Normal" : "Perhatian",
      reading.source
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement("td");
      if (index === 3) {
        const badge = document.createElement("span");
        badge.className = `badge ${safe ? "ok" : "alert"}`;
        const dot = document.createElement("i");
        dot.className = "dot";
        if (!safe) dot.style.background = "var(--orange)";
        badge.append(dot, document.createTextNode(value));
        cell.append(badge);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    }
    return row;
  });
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Belum ada data pembacaan sensor.";
    row.append(cell);
    rows.push(row);
  }
  body.replaceChildren(...rows);
}

export async function initializeHistory() {
  let readings = await getHistory();
  renderHistory(readings);
  window.addEventListener("settings:updated", () => renderHistory(readings));
  window.setInterval(async () => {
    try {
      readings = await getHistory();
      renderHistory(readings);
    } catch (error) {
      console.error("Gagal memperbarui riwayat pembacaan.", error);
    }
  }, 30_000);
}
