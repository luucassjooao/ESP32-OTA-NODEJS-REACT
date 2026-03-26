export interface DeviceSecrets {
  wifiSsid: string;
  wifiPassword: string;
  localIp: string;
}

export function getDeviceSecrets(): DeviceSecrets {
  const { WIFI_SSID, WIFI_PASSWORD, LOCAL_IP } = process.env;

  if (!WIFI_SSID || !WIFI_PASSWORD || !LOCAL_IP) {
    throw new Error("Missing required env vars");
  }

  return {
    wifiSsid: WIFI_SSID,
    wifiPassword: WIFI_PASSWORD,
    localIp: LOCAL_IP,
  };
}
