const settingsStore = require("../settings-store");

function getSettings() {
  return settingsStore.getSettings();
}

function updateSettings(settings) {
  return settingsStore.saveSettings(settings);
}

module.exports = { getSettings, updateSettings };
