import * as fs from "fs/promises";
import * as path from "path";
import { getLocalIPv4 } from "../config/getIp";

interface TemplateContext {
  backendIp?: string;
  codeConfiguration: string;
  codeSetup: string;
  codeLoop: string;
  codeFuncs: string;
  wifiSsid: string;
  wifiPassword: string;
}

interface TemplateContext {
  codeConfiguration: string;
  codeSetup: string;
  codeLoop: string;
  codeFuncs: string;
  wifiSsid: string;
  wifiPassword: string;
}

function renderTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/<%=\s*(\w+)\s*%>/g, (_, key) => {
    if (!(key in ctx))
      throw new Error(`Template variable '${key}' not provided`);
    return ctx[key];
  });
}

export async function buildFirmwareSource(
  context: TemplateContext,
): Promise<string> {
  const templatePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "firmware.template.ino",
  );
  const template = await fs.readFile(templatePath, "utf-8");

  return renderTemplate(template, {
    backendIp: getLocalIPv4() || "192.168.2.7",
    codeConfiguration: context.codeConfiguration,
    codeSetup: context.codeSetup,
    codeLoop: context.codeLoop,
    codeFuncs: context.codeFuncs,
    wifiSsid: context.wifiSsid,
    wifiPassword: context.wifiPassword,
  });
}
