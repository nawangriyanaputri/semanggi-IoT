import { getHealth, getHistory, getTrend } from "../api.js";

const DAY_MS = 86_400_000;
const chartBounds = { left: 44, right: 590, top: 20, bottom: 172 };
const rangeSelect = document.querySelector("#chart-range-monitor");
const rangeForm = document.querySelector("#monitoring-date-form");
const rangeMessage = document.querySelector("#monitoring-range-message");
let dataMode = "simulation";

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value, options) {
  return new Intl.DateTimeFormat("id-ID", options).format(new Date(value));
}

function renderChart(samples, chart) {
  if (!samples.length) {
    chart.querySelector(".chart-temp").setAttribute("d", "");
    chart.querySelector(".chart-hum").setAttribute("d", "");
    if (chart.dataset.chart === "monitoring") {
      rangeMessage.textContent = "Belum ada data pengukuran pada rentang tanggal ini.";
      rangeMessage.hidden = false;
    }
    return;
  }

  const linePath = (key, min, max) => samples.map((sample, index) => {
    const x = chartBounds.left + index * (chartBounds.right - chartBounds.left) / Math.max(samples.length - 1, 1);
    const y = chartBounds.bottom -
      (sample[key] - min) * (chartBounds.bottom - chartBounds.top) / (max - min);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  chart.querySelector(".chart-temp").setAttribute("d", linePath("temperature", 2, 10));
  chart.querySelector(".chart-hum").setAttribute("d", linePath("humidity", 40, 80));

  const labelGroup = chart.querySelector(".chart-xlabels");
  if (!labelGroup) return;
  const labelCount = Math.min(samples.length, 6);
  const sameDay = samples[0].timestamp.slice(0, 10) === samples[samples.length - 1].timestamp.slice(0, 10);
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const sampleIndex = Math.round(index * (samples.length - 1) / Math.max(labelCount - 1, 1));
    const sample = samples[sampleIndex];
    const x = chartBounds.left + sampleIndex * (chartBounds.right - chartBounds.left) /
      Math.max(samples.length - 1, 1);
    const options = sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" };
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x.toFixed(1));
    text.setAttribute("y", "195");
    text.setAttribute("text-anchor", index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle");
    text.textContent = formatDate(sample.timestamp, options);
    return text;
  });
  labelGroup.replaceChildren(...labels);
}

function setSubtitle(from, to, label) {
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  const range = from === to
    ? formatDate(`${from}T00:00:00`, dateOptions)
    : `${formatDate(`${from}T00:00:00`, dateOptions)} – ${formatDate(`${to}T00:00:00`, dateOptions)}`;
  const sourceLabel = dataMode === "simulation" ? "data simulasi" : "data sensor aktual";
  document.querySelector("#monitoring-chart-subtitle").textContent = `${label} · ${range} · ${sourceLabel}`;
}

function showError(message) {
  rangeMessage.textContent = message;
  rangeMessage.hidden = false;
}

async function loadTrend(from, to, label) {
  rangeMessage.hidden = true;
  try {
    const readings = await getTrend(from, to);
    renderChart(readings, document.querySelector('[data-chart="monitoring"]'));
    if (!rangeMessage.hidden) return;
    setSubtitle(from, to, label);
  } catch (error) {
    console.error("Gagal memuat tren pengukuran.", error);
    showError(error.message);
  }
}

function getPresetRange(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayValue = toDateInputValue(today);
  if (period === "today") return { from: todayValue, to: todayValue, label: "Hari ini" };

  const yesterday = new Date(today.getTime() - DAY_MS);
  const yesterdayValue = toDateInputValue(yesterday);
  if (period === "yesterday") {
    return { from: yesterdayValue, to: yesterdayValue, label: "Kemarin" };
  }

  const lastWeekStart = new Date(today.getTime() - 7 * DAY_MS);
  return {
    from: toDateInputValue(lastWeekStart),
    to: yesterdayValue,
    label: "Satu minggu yang lalu"
  };
}

function initializeCustomRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = document.querySelector("#monitoring-date-to");
  const from = document.querySelector("#monitoring-date-from");
  const todayValue = toDateInputValue(today);

  to.max = todayValue;
  from.max = todayValue;
  from.value = toDateInputValue(new Date(today.getTime() - 6 * DAY_MS));
  to.value = todayValue;
  to.min = from.value;
  from.addEventListener("change", () => { to.min = from.value; });
}

export async function initializeMonitoring() {
  const chart = document.querySelector('[data-chart="monitoring"]');
  const dashboardChart = document.querySelector('[data-chart="dashboard"]');
  const health = await getHealth();
  dataMode = health.dataMode;
  const history = await getHistory();
  if (dashboardChart) {
    renderChart(history.slice().reverse(), dashboardChart);
  }

  initializeCustomRange();
  rangeSelect.addEventListener("change", () => {
    rangeMessage.hidden = true;
    if (rangeSelect.value === "custom") {
      rangeForm.hidden = false;
      return;
    }

    rangeForm.hidden = true;
    const period = getPresetRange(rangeSelect.value);
    loadTrend(period.from, period.to, period.label);
  });

  rangeForm.addEventListener("submit", event => {
    event.preventDefault();
    const from = document.querySelector("#monitoring-date-from").value;
    const to = document.querySelector("#monitoring-date-to").value;
    if (!from || !to || from > to) {
      showError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.");
      return;
    }
    loadTrend(from, to, "Rentang tanggal");
  });

  const period = getPresetRange("today");
  await loadTrend(period.from, period.to, period.label);

  window.setInterval(async () => {
    try {
      const recentReadings = await getHistory();
      if (dashboardChart) renderChart(recentReadings.slice().reverse(), dashboardChart);
      if (rangeSelect.value === "custom") {
        const from = document.querySelector("#monitoring-date-from").value;
        const to = document.querySelector("#monitoring-date-to").value;
        if (from && to) await loadTrend(from, to, "Rentang tanggal");
      } else {
        const selectedPeriod = getPresetRange(rangeSelect.value);
        await loadTrend(selectedPeriod.from, selectedPeriod.to, selectedPeriod.label);
      }
    } catch (error) {
      console.error("Gagal memperbarui data monitoring.", error);
    }
  }, 30_000);
}
