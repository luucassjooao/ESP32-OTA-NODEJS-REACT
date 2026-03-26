#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>

const char* WIFI_SSID      = "";
// ALTERAR PARA O NOME DA REDE WIFI
const char* WIFI_PASSWORD  = "";
// ALTERAR PARA A SENHA DA REDE WIFI
const char* BACKEND_IP = "192.168.xx.xx";
// ALTERAR PARA O ENDERÇO LOCAL DO BACKEND
const char* BACKEND_PORT = "5500";
// ALTERAR PARA A PORTA CORRETA
const char* BACKEND_URL    = "http://",BACKEND_IP,":",BACKEND_PORT,"/firmware/latest.bin";

WebServer server(80);

void performOTA() {
  Serial.printf("[OTA] Attempting to reach backend at %s:%s\n", BACKEND_IP, BACKEND_PORT);

  WiFiClient testClient;
  if (!testClient.connect(BACKEND_IP, atoi(BACKEND_PORT))) {
    Serial.println("[OTA] TCP connection FAILED — backend unreachable.");
    Serial.printf("[OTA] ESP IP: %s | Gateway: %s\n",
      WiFi.localIP().toString().c_str(),
      WiFi.gatewayIP().toString().c_str());
    return;
  }
  testClient.stop();
  Serial.println("[OTA] TCP connection OK — proceeding with update.");
  
  Serial.println("[OTA] Checking for update...");

  WiFiClient client;

  httpUpdate.onStart([]() {
    Serial.println("[OTA] Update started.");
  });

  httpUpdate.onProgress([](int current, int total) {
    static int lastPercent = -1;
    int percent = (current * 100) / total;
    if (percent / 10 != lastPercent / 10) {
      Serial.printf("[OTA] Progress: %d%% (%d / %d bytes)\n", percent, current, total);
      lastPercent = percent;
    }
  });

  httpUpdate.onEnd([]() {
    Serial.println("[OTA] Update complete. Rebooting...");
  });

  httpUpdate.onError([](int error) {
    Serial.printf("[OTA] Error (%d): %s\n", error, httpUpdate.getLastErrorString().c_str());
  });

  t_httpUpdate_return ret = httpUpdate.update(client, BACKEND_URL);

  switch (ret) {
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] Success — device will reboot.");
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] No update available.");
      break;
    case HTTP_UPDATE_FAILED:
      Serial.printf("[OTA] Failed: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n[BOOT] Starting up...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("[WiFi] Connected! IP: %s | RSSI: %d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());

  server.on("/ota-trigger", HTTP_POST, []() {
    server.send(200, "text/plain", "OTA triggered");
    performOTA();
  });

  server.begin();
  Serial.println("[HTTP] Server ready. POST /ota-trigger to update.");
}

void loop() {
  server.handleClient();
}