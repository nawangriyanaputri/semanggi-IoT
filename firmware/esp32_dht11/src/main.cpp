#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <math.h>
#include "secrets.h"

const char *API_URL = "http://192.168.1.56:3000/api/monitoring/readings";
const char *DEVICE_ID = "ruang-penyimpanan-1";

constexpr uint8_t DHT_PIN = 4;
constexpr uint32_t SEND_INTERVAL_MS = 30000;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 25000;
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);
uint32_t lastSendAt = 0;
uint32_t lastWiFiAttemptAt = 0;
bool hasAttemptedWiFi = false;

bool connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  const uint32_t now = millis();
  if (hasAttemptedWiFi && now - lastWiFiAttemptAt < WIFI_RETRY_INTERVAL_MS) {
    return false;
  }

  hasAttemptedWiFi = true;
  lastWiFiAttemptAt = now;
  Serial.print("Menghubungkan ke Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t attemptStartedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - attemptStartedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWi-Fi belum tersambung; akan mencoba lagi.");
    return false;
  }

  Serial.printf("\nWi-Fi terhubung. IP ESP32: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

void sendReading(float temperature, float humidity) {
  HTTPClient http;
  if (!http.begin(API_URL)) {
    Serial.println("Gagal membuka koneksi ke API.");
    return;
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
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  lastSendAt = millis() - SEND_INTERVAL_MS;
  connectToWiFi();
}

void loop() {
  if (!connectToWiFi()) {
    delay(250);
    return;
  }
  const uint32_t now = millis();
  if (now - lastSendAt < SEND_INTERVAL_MS) {
    delay(100);
    return;
  }
  lastSendAt = now;

  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Pembacaan DHT11 gagal; data tidak dikirim.");
    return;
  }

  Serial.printf("Suhu: %.1f C, kelembapan: %.1f %%RH\n", temperature, humidity);
  sendReading(temperature, humidity);
}
