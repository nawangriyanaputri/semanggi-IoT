import { getHealth } from "./api.js";
import { initializeAiAnalysis } from "./features/ai-analysis.js";
import { initializeDashboard } from "./features/dashboard.js";
import { initializeHistory } from "./features/history.js";
import { initializeMonitoring } from "./features/monitoring.js";
import { initializeSettings } from "./features/settings.js";

const labels = {
  dashboard: "Dashboard",
  monitoring: "Monitoring",
  analysis: "Analisis Data",
  history: "Riwayat Data",
  settings: "Pengaturan"
};

function initializeNavigation() {
  const navItems = [...document.querySelectorAll(".nav-item")];
  const views = [...document.querySelectorAll(".view")];

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      navItems.forEach(nav => {
        const active = nav === item;
        nav.classList.toggle("active", active);
        if (active) nav.setAttribute("aria-current", "page");
        else nav.removeAttribute("aria-current");
      });
      views.forEach(panel => { panel.hidden = panel.id !== `view-${view}`; });
      document.querySelector("#breadcrumb").textContent = labels[view];
      document.querySelector("#save-message").textContent = "";
    });
  });
}

function initializeDates() {
  const now = new Date();
  const formatDate = options => new Intl.DateTimeFormat("id-ID", options).format(now);
  document.querySelector("#today").textContent =
    formatDate({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
  document.querySelector("#date-label").textContent = formatDate({ day: "numeric", month: "long", year: "numeric" });
}

function formatReadingTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "waktu tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setApiStatus(health) {
  const connected = Boolean(health);
  document.querySelector("#api-status").textContent = connected ? "API terhubung" : "API terputus";
  document.querySelector("#api-status-dot").style.background = connected ? "var(--green)" : "var(--red)";
  const deviceStatus = document.querySelector("#device-status");
  if (!deviceStatus) return;
  const deviceDot = deviceStatus.previousElementSibling;
  const deviceStatusDetail = document.querySelector("#device-status-detail");
  if (!connected || health.dataMode === "simulation") {
    deviceStatus.textContent = connected ? "ESP32 · Mode simulasi" : "ESP32 · Status tak diketahui";
    deviceDot.style.background = connected ? "var(--orange)" : "var(--red)";
    deviceStatusDetail.textContent = connected
      ? "Nilai yang tampil adalah data simulasi, bukan data dari alat."
      : "Backend tidak dapat dihubungi; status dan pembacaan sensor belum diketahui.";
    document.querySelector("#dashboard-data-note").textContent = connected
      ? "Aplikasi berjalan dalam mode simulasi. Atur DATA_MODE=live pada backend untuk memakai pembacaan ESP32."
      : "Backend tidak terhubung; status perangkat dan data terbaru tidak dapat dipastikan.";
    return;
  }
  if (health.deviceStatus === "online") {
    deviceDot.style.background = "var(--green)";
    deviceStatus.textContent = "ESP32 · Data diterima";
    deviceStatusDetail.textContent =
      `Pembacaan terakhir: ${formatReadingTime(health.lastReadingAt)}. Nilai diperbarui otomatis.`;
  } else if (health.deviceStatus === "offline") {
    const offlineSeconds = Math.ceil((health.offlineAfterMs || 90_000) / 1000);
    deviceDot.style.background = "var(--orange)";
    deviceStatus.textContent = "ESP32 · Tidak ada data baru";
    deviceStatusDetail.textContent =
      `Terakhir diterima: ${formatReadingTime(health.lastReadingAt)}. Tidak ada kiriman selama ${offlineSeconds} detik; periksa Serial Monitor ESP32.`;
  } else {
    deviceDot.style.background = "var(--orange)";
    deviceStatus.textContent = "ESP32 · Belum ada data";
    deviceStatusDetail.textContent =
      "Backend belum pernah menerima pembacaan. Pastikan ESP32 aktif dan periksa hasil kirim di Serial Monitor.";
  }
  document.querySelector("#dashboard-data-note").textContent =
    "Status mengikuti pembacaan aktual yang diterima backend. Data terbaru dan status diperiksa otomatis.";
}

async function refreshApiStatus() {
  try {
    setApiStatus(await getHealth());
  } catch (error) {
    console.error("Gagal memeriksa status API.", error);
    setApiStatus(null);
  }
}

function showError(error) {
  console.error("Gagal memuat fitur dari backend.", error);
  const message = document.querySelector("#api-error");
  message.textContent = `Backend belum tersedia: ${error.message}. Jalankan server backend lalu muat ulang halaman.`;
  message.hidden = false;
  setApiStatus(null);
}

async function initializeApp() {
  initializeNavigation();
  initializeDates();

  try {
    await initializeSettings();
    await Promise.all([
      initializeDashboard(),
      initializeMonitoring(),
      initializeAiAnalysis(),
      initializeHistory()
    ]);
    await refreshApiStatus();
    window.setInterval(refreshApiStatus, 15_000);
  } catch (error) {
    showError(error);
  }
}

initializeApp();
