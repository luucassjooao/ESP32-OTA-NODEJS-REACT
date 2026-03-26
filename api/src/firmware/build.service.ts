import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { buildFirmwareSource } from "./template.service";

const DEVICE_NAME = "firmware";

const BUILDS_ROOT = path.join(process.cwd(), "firmwares", "builds");
const OUTPUT_ROOT = path.join(process.cwd(), "firmwares", "output");
const VERSIONS_ROOT = path.join(process.cwd(), "firmwares", "versions");

export interface BuildContext {
  codeConfiguration: string;
  codeSetup: string;
  codeLoop: string;
  codeFuncs: string;
  wifiSsid: string;
  wifiPassword: string;
}

async function prepareBuildDir(source: string): Promise<string> {
  const deviceBuildDir = path.join(BUILDS_ROOT, DEVICE_NAME);

  await fs.rm(deviceBuildDir, { recursive: true, force: true });
  await fs.mkdir(deviceBuildDir, { recursive: true });

  const inoPath = path.join(deviceBuildDir, `${DEVICE_NAME}.ino`);
  await fs.writeFile(inoPath, source, "utf-8");

  return deviceBuildDir;
}

async function archiveSource(source: string): Promise<void> {
  await fs.mkdir(VERSIONS_ROOT, { recursive: true });
  const stamp = Date.now();
  const archivePath = path.join(VERSIONS_ROOT, `${DEVICE_NAME}-${stamp}.ino`);
  await fs.writeFile(archivePath, source, "utf-8");
}

async function compile(buildDir: string): Promise<string> {
  const deviceOutputDir = path.join(OUTPUT_ROOT, DEVICE_NAME);
  await fs.mkdir(deviceOutputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn("arduino-cli", [
      "compile",
      "--fqbn",
      "esp32:esp32:esp32",
      "--output-dir",
      deviceOutputDir,
      buildDir,
    ]);

    let stderr = "";

    proc.stdout.on("data", (data) => {
      console.log(`[compile] ${data.toString().trim()}`);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      console.warn(`[compile] stderr: ${data.toString().trim()}`);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Compilation failed (exit ${code}):\n${stderr}`),
        );
      }
      console.log(`[compile] Done. Output → ${deviceOutputDir}`);
      resolve(path.join(deviceOutputDir, `${DEVICE_NAME}.ino.bin`));
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn arduino-cli: ${err.message}`));
    });
  });
}

export async function buildFirmware(ctx: BuildContext): Promise<string> {
  const source = await buildFirmwareSource({
    ...ctx,
  });

  const buildDir = await prepareBuildDir(source);
  await archiveSource(source);
  const binPath = await compile(buildDir);
  return binPath;
}
