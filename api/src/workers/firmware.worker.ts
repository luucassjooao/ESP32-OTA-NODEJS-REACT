import "dotenv/config";
import { Worker } from "bullmq";
import { buildFirmware } from "../firmware/build.service";
import { triggerOTA } from "../firmware/ota.service";
import { getDeviceSecrets } from "../config/secrets";

new Worker(
  "firmware",
  async (job) => {
    const { codeConfiguration, codeSetup, codeLoop, codeFuncs } = job.data as {
      codeConfiguration: string;
      codeSetup: string;
      codeLoop: string;
      codeFuncs: string;
    };

    const { wifiSsid, wifiPassword, localIp } = getDeviceSecrets();

    await buildFirmware({
      codeConfiguration,
      codeSetup,
      codeLoop,
      codeFuncs,
      wifiSsid,
      wifiPassword,
    });

    await triggerOTA(localIp);
  },
  {
    connection: { host: "localhost", port: 6379 },
    concurrency: 1,
  },
);

console.log("Firmware worker is running...");
