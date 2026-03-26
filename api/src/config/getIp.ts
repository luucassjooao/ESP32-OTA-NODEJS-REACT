import * as os from "os";

export function getLocalIPv4(): string | undefined {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];

    for (const addr of addresses!) {
      if (
        addr.family === "IPv4" &&
        !addr.internal &&
        addr.address.startsWith("192.168.2")
      ) {
        return addr.address;
      }
    }
  }
}
