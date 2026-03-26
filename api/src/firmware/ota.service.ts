import * as path from "path";
import fetch from "node-fetch";
import net from "net";

const OUTPUT_ROOT = path.join(process.cwd(), "firmwares", "output");

export function getFirmwareBinPath(): string {
  return path.join(OUTPUT_ROOT, "firmware", "firmware.ino.bin");
}

function checkPortOpen(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => {
      console.log(`[OTA] Port ${port} on ${host} is open.`);
      socket.destroy();
      resolve();
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`${host}:${port} unreachable (timeout)`));
    });
    socket.on("error", (err) =>
      reject(new Error(`${host}:${port} unreachable — ${err.message}`)),
    );
  });
}

export async function triggerOTA(deviceIp: string): Promise<void> {
  await checkPortOpen(deviceIp, 80);

  const res = await fetch(`http://${deviceIp}/ota-trigger`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`[OTA] Trigger failed: HTTP ${res.status}`);
  }
}
