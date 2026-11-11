const fs = require("node:fs/promises");
const path = require("node:path");

const settingsPath = path.join(__dirname, "..", "data", "settings.json");
const defaults = Object.freeze({ tempMin: 2, tempMax: 8, humidityMin: 40, humidityMax: 70 });

function validateSettings(settings) {
  const keys = Object.keys(defaults);
  if (!settings || keys.some(key => !Number.isFinite(settings[key]))) {
    throw new Error("Semua nilai pengaturan harus berupa angka.");
  }
  if (settings.tempMin >= settings.tempMax ||
      settings.humidityMin < 0 || settings.humidityMin >= settings.humidityMax ||
      settings.humidityMax > 100) {
    throw new Error("Rentang suhu atau kelembapan tidak valid.");
  }
  return Object.fromEntries(keys.map(key => [key, settings[key]]));
}

async function getSettings() {
  try {
    return validateSettings(JSON.parse(await fs.readFile(settingsPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return { ...defaults };
    throw error;
  }
}

async function saveSettings(settings) {
  const validated = validateSettings(settings);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

module.exports = { getSettings, saveSettings };
