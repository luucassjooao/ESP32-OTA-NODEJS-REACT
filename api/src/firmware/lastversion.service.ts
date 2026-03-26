import fs from "node:fs/promises";
import path from "node:path";

const VERSIONS_ROOT = path.join(process.cwd(), "firmwares", "versions");

export async function readLatestVersion(): Promise<string> {
  const files = await fs.readdir(VERSIONS_ROOT, { withFileTypes: true });

  const inoFiles = files
    .filter((f) => f.isFile() && f.name.endsWith(".ino"))
    .map((f) => f.name);

  if (inoFiles.length === 0) {
    console.log("No versions found.");
    return "No versions found.";
  }

  const latest = inoFiles.sort((a, b) => {
    const tsA = parseInt(a.split("-")[1]);
    const tsB = parseInt(b.split("-")[1]);
    return tsB - tsA;
  })[0];

  const filePath = path.join(VERSIONS_ROOT, latest);
  const content = await fs.readFile(filePath, "utf-8");

  return content;
}
