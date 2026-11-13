import { getExportHistory, getHistory } from "../api.js";
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

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(readings) {
  const rows = [
    ["Waktu", "Suhu (°C)", "Kelembapan (%RH)", "Sumber"],
    ...readings.map(reading => [
      reading.timestamp,
      reading.temperature,
      reading.humidity,
      reading.source
    ])
  ];
  const csv = rows.map(row => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `riwayat-sensor-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function initializeHistory() {
  let readings = await getHistory();
  renderHistory(readings);
  const downloadButton = document.querySelector("#download-history");
  const downloadStatus = document.querySelector("#history-download-status");
  downloadButton.addEventListener("click", async () => {
    downloadButton.disabled = true;
    downloadStatus.textContent = "Menyiapkan unduhan…";
    try {
      const allReadings = await getExportHistory();
      if (!allReadings.length) {
        downloadStatus.textContent = "Belum ada riwayat untuk diunduh.";
        return;
      }
      downloadCsv(allReadings);
      downloadStatus.textContent = `${allReadings.length} pembacaan berhasil disiapkan.`;
    } catch (error) {
      console.error("Gagal mengunduh riwayat pembacaan.", error);
      downloadStatus.textContent = `Unduhan gagal: ${error.message}`;
    } finally {
      downloadButton.disabled = false;
    }
  });
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
