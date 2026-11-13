#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <math.h>
#include <ArduinoJson.h>
#include "secrets.h"
#include "network_config.h"

const char *DEVICE_ID = "ruang-penyimpanan-1";

constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t BUZZER_PIN = 19;
constexpr uint8_t BUTTON_PIN = 26;
constexpr uint8_t BUZZER_ACTIVE_LEVEL = LOW;
constexpr uint8_t BUZZER_INACTIVE_LEVEL = HIGH;
constexpr uint32_t READING_INTERVAL_MS = 300000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 10000;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
constexpr uint32_t SEND_RETRY_INTERVAL_MS = 15000;
constexpr uint32_t BUZZER_POLL_INTERVAL_MS = 2000;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 50;
constexpr uint32_t BUZZER_MUTE_DURATION_MS = 60000;
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);
uint32_t lastReadingAt = 0;
uint32_t lastWiFiAttemptAt = 0;
bool hasAttemptedWiFi = false;
bool wifiConnectInProgress = false;
bool wasWiFiConnected = false;
uint32_t lastSettingsFetchAt = 0;
bool hasAttemptedSettingsFetch = false;
bool hasBackendSettings = false;
uint32_t lastBuzzerPollAt = 0;
bool hasAttemptedBuzzerPoll = false;
uint64_t lastRemoteMuteUntil = 0;
uint32_t lastSendAttemptAt = 0;
bool hasAttemptedSending = false;
bool hasPendingReading = false;
float pendingTemperature = 0;
float pendingHumidity = 0;
bool hasSensorReading = false;
float latestTemperature = 0;
float latestHumidity = 0;
float temperatureMin = 2;
float temperatureMax = 8;
float humidityMin = 40;
float humidityMax = 70;
bool alarmActive = false;
bool buzzerMuted = false;
uint32_t buzzerMutedAt = 0;
uint32_t buzzerMuteDurationMs = BUZZER_MUTE_DURATION_MS;
int lastButtonReading = HIGH;
int stableButtonState = HIGH;
uint32_t lastButtonChangeAt = 0;

bool connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnectInProgress = false;
    if (!wasWiFiConnected) {
      Serial.printf("Wi-Fi terhubung. IP ESP32: %s\n", WiFi.localIP().toString().c_str());
      wasWiFiConnected = true;
    }
    return true;
  }
  if (wasWiFiConnected) {
    Serial.println("Wi-Fi terputus.");
    wasWiFiConnected = false;
  }

  const uint32_t now = millis();
  if (wifiConnectInProgress) {
    if (now - lastWiFiAttemptAt < WIFI_CONNECT_TIMEOUT_MS) {
      return false;
    }
    Serial.println("Waktu koneksi Wi-Fi habis; mencoba kembali.");
    WiFi.disconnect(false, false);
    wifiConnectInProgress = false;
  }
  if (hasAttemptedWiFi && now - lastWiFiAttemptAt < WIFI_RETRY_INTERVAL_MS) {
    return false;
  }

  hasAttemptedWiFi = true;
  lastWiFiAttemptAt = now;
  wifiConnectInProgress = true;
  Serial.println("Menghubungkan ke Wi-Fi.");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  return WiFi.status() == WL_CONNECTED;
}

bool fetchBackendSettings() {
  if (WiFi.status() != WL_CONNECTED) return false;

  const uint32_t now = millis();
  if (hasAttemptedSettingsFetch && now - lastSettingsFetchAt < READING_INTERVAL_MS) {
    return hasBackendSettings;
  }
  hasAttemptedSettingsFetch = true;
  lastSettingsFetchAt = now;

  HTTPClient http;
  if (!http.begin(SETTINGS_URL)) {
    Serial.println("Gagal membuka endpoint pengaturan backend.");
    return false;
  }
  http.setTimeout(5000);
  const int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Gagal membaca pengaturan backend; HTTP %d.\n", statusCode);
    http.end();
    return false;
  }

  JsonDocument settings;
  const DeserializationError error = deserializeJson(settings, http.getString());
  http.end();
  if (error) {
    Serial.printf("Format pengaturan backend tidak valid: %s\n", error.c_str());
    return false;
  }

  const float nextTemperatureMin = settings["tempMin"] | NAN;
  const float nextTemperatureMax = settings["tempMax"] | NAN;
  const float nextHumidityMin = settings["humidityMin"] | NAN;
  const float nextHumidityMax = settings["humidityMax"] | NAN;
  if (!isfinite(nextTemperatureMin) || !isfinite(nextTemperatureMax) ||
      !isfinite(nextHumidityMin) || !isfinite(nextHumidityMax) ||
      nextTemperatureMin >= nextTemperatureMax ||
      nextHumidityMin < 0 || nextHumidityMin >= nextHumidityMax ||
      nextHumidityMax > 100) {
    Serial.println("Rentang pengaturan backend tidak valid; memakai pengaturan terakhir.");
    return false;
  }

  temperatureMin = nextTemperatureMin;
  temperatureMax = nextTemperatureMax;
  humidityMin = nextHumidityMin;
  humidityMax = nextHumidityMax;
  hasBackendSettings = true;
  Serial.printf("Batas alarm: suhu %.1f-%.1f C, kelembapan %.1f-%.1f %%RH\n",
    temperatureMin, temperatureMax, humidityMin, humidityMax);
  return true;
}

void setAlarmActive(bool active) {
  if (alarmActive == active) return;

  alarmActive = active;
  buzzerMuted = false;
  Serial.println(alarmActive
    ? "PERINGATAN: suhu atau kelembapan di luar batas."
    : "Kondisi kembali normal; buzzer dimatikan.");
}

void updateButton() {
  const uint32_t now = millis();
  const int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonReading) {
    lastButtonReading = reading;
    lastButtonChangeAt = now;
  }

  if (now - lastButtonChangeAt < BUTTON_DEBOUNCE_MS ||
      reading == stableButtonState) {
    return;
  }

  stableButtonState = reading;
  if (stableButtonState == LOW && alarmActive) {
    buzzerMuted = true;
    buzzerMutedAt = now;
    buzzerMuteDurationMs = BUZZER_MUTE_DURATION_MS;
    Serial.println("Tombol ditekan; buzzer senyap selama 1 menit.");
  }
}

void updateBuzzer() {
  if (buzzerMuted && millis() - buzzerMutedAt >= buzzerMuteDurationMs) {
    buzzerMuted = false;
    Serial.println("Waktu senyap selesai; buzzer peringatan aktif kembali.");
  }
  const bool shouldSound = alarmActive && !buzzerMuted;
  digitalWrite(BUZZER_PIN, shouldSound ? BUZZER_ACTIVE_LEVEL : BUZZER_INACTIVE_LEVEL);
}

bool fetchRemoteBuzzerCommand() {
  if (WiFi.status() != WL_CONNECTED) return false;

  const uint32_t now = millis();
  if (hasAttemptedBuzzerPoll && now - lastBuzzerPollAt < BUZZER_POLL_INTERVAL_MS) {
    return true;
  }
  hasAttemptedBuzzerPoll = true;
  lastBuzzerPollAt = now;

  HTTPClient http;
  if (!http.begin(BUZZER_URL)) {
    Serial.println("Gagal membuka endpoint perintah buzzer.");
    return false;
  }
  http.setTimeout(5000);
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  const int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Gagal memeriksa perintah buzzer; HTTP %d.\n", statusCode);
    http.end();
    return false;
  }

  JsonDocument command;
  const DeserializationError error = deserializeJson(command, http.getString());
  http.end();
  if (error) {
    Serial.printf("Format perintah buzzer tidak valid: %s\n", error.c_str());
    return false;
  }

  const uint64_t muteUntil = command["muteUntil"].as<uint64_t>();
  const uint32_t remainingMs = command["remainingMs"].as<uint32_t>();
  if (muteUntil == 0 || muteUntil == lastRemoteMuteUntil) return true;
  lastRemoteMuteUntil = muteUntil;
  if (remainingMs == 0) return true;

  buzzerMuted = true;
  buzzerMutedAt = millis();
  buzzerMuteDurationMs = min(remainingMs, BUZZER_MUTE_DURATION_MS);
  Serial.printf("Perintah web diterima; buzzer senyap selama %lu detik.\n",
    static_cast<unsigned long>(buzzerMuteDurationMs / 1000));
  updateBuzzer();
  return true;
}

void evaluateLatestReading() {
  if (!hasSensorReading) return;
  const bool outsideLimits = latestTemperature < temperatureMin ||
    latestTemperature > temperatureMax ||
    latestHumidity < humidityMin ||
    latestHumidity > humidityMax;
  setAlarmActive(outsideLimits);
  updateBuzzer();
}

bool sendReading(float temperature, float humidity) {
  HTTPClient http;
  if (!http.begin(API_URL)) {
    Serial.println("Gagal membuka koneksi ke API.");
    return false;
  }

  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  const String payload = String("{\"deviceId\":\"") + DEVICE_ID +
    "\",\"temperature\":" + String(temperature, 1) +
    ",\"humidity\":" + String(humidity, 1) + "}";

  const int statusCode = http.POST(payload);
  if (statusCode > 0) {
    Serial.printf("API merespons HTTP %d: %s\n", statusCode, http.getString().c_str());
  } else {
    Serial.printf("Pengiriman gagal: %s\n", http.errorToString(statusCode).c_str());
  }
  http.end();
  return statusCode == HTTP_CODE_OK;
}

void readSensorAndSend() {
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Pembacaan DHT11 gagal; data tidak dikirim.");
    return;
  }

  Serial.printf("Suhu: %.1f C, kelembapan: %.1f %%RH\n", temperature, humidity);
  fetchBackendSettings();
  latestTemperature = temperature;
  latestHumidity = humidity;
  hasSensorReading = true;
  evaluateLatestReading();

  pendingTemperature = temperature;
  pendingHumidity = humidity;
  hasPendingReading = true;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Data dibaca dan disimpan sementara; menunggu Wi-Fi untuk mengirim.");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_INACTIVE_LEVEL);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  stableButtonState = digitalRead(BUTTON_PIN);
  lastButtonReading = stableButtonState;
  WiFi.mode(WIFI_STA);
  dht.begin();
  lastReadingAt = millis() - READING_INTERVAL_MS;
  connectToWiFi();
}

void loop() {
  updateButton();
  connectToWiFi();
  fetchRemoteBuzzerCommand();
  if (WiFi.status() == WL_CONNECTED && fetchBackendSettings()) {
    evaluateLatestReading();
  }
  const uint32_t now = millis();
  if (now - lastReadingAt >= READING_INTERVAL_MS) {
    lastReadingAt = now;
    readSensorAndSend();
  }
  if (WiFi.status() == WL_CONNECTED && hasPendingReading &&
      (!hasAttemptedSending || now - lastSendAttemptAt >= SEND_RETRY_INTERVAL_MS)) {
    hasAttemptedSending = true;
    lastSendAttemptAt = now;
    if (sendReading(pendingTemperature, pendingHumidity)) {
      hasPendingReading = false;
    }
  }
  updateButton();
  updateBuzzer();
  delay(10);
}
