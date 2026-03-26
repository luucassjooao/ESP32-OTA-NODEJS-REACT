import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ScrollArea } from "./components/ui/scroll-area";

export type SegmentId =
  | "codeConfiguration"
  | "codeSetup"
  | "codeLoop"
  | "codeFuncs";

export interface ESPEditorValues {
  codeConfiguration: string;
  codeSetup: string;
  codeLoop: string;
  codeFuncs: string;
}

export interface ESPEditorProps {
  defaultValues?: Partial<ESPEditorValues>;
  onChange?: (values: ESPEditorValues) => void;
}

type LastVersionState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "loaded"; code: string };

const LINE_H = 22;

const EMPTY_VALUES: ESPEditorValues = {
  codeConfiguration: "",
  codeSetup: "",
  codeLoop: "",
  codeFuncs: "",
};

type LockedChunk = { kind: "locked"; text: string };
type EditableChunk = {
  kind: "editable";
  id: SegmentId;
  placeholder: string;
  minHeight: number;
};
type Chunk = LockedChunk | EditableChunk;

const LOCKED_TOP = `#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>`;

const LOCKED_MIDDLE_1 = `const char* WIFI_SSID      = "<%= wifiSsid %>";
const char* WIFI_PASSWORD  = "<%= wifiPassword %>";
const char* BACKEND_URL    = "http://<%= backendIp %>:5500/firmware/latest.bin";
const char* BACKEND_IP = "<%= backendIp %>";
const char* BACKEND_PORT = "5500";
IPAddress LOCAL_IP(192, 168, 2, 32);
WebServer server(80);
void performOTA() {
  Serial.printf("[OTA] Attempting to reach backend at %s:%s\\n", BACKEND_IP, BACKEND_PORT);
  WiFiClient testClient;
  if (!testClient.connect(BACKEND_IP, atoi(BACKEND_PORT))) {
    Serial.println("[OTA] TCP connection FAILED — backend unreachable.");
    Serial.printf("[OTA] ESP IP: %s | Gateway: %s\\n",
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
      Serial.printf("[OTA] Progress: %d%% (%d / %d bytes)\\n", percent, current, total);
      lastPercent = percent;
    }
  });
  httpUpdate.onEnd([]() {
    Serial.println("[OTA] Update complete. Rebooting...");
  });
  httpUpdate.onError([](int error) {
    Serial.printf("[OTA] Error (%d): %s\\n", error, httpUpdate.getLastErrorString().c_str());
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
      Serial.printf("[OTA] Failed: %s\\n", httpUpdate.getLastErrorString().c_str());
      break;
  }
}
void setup() {`;

const LOCKED_MIDDLE_2 = `  Serial.begin(115200);
  Serial.println("\\n[BOOT] Starting up...");
  WiFi.config(LOCAL_IP);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("[WiFi] Connected! IP: %s | RSSI: %d dBm\\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());
  server.on("/ota-trigger", HTTP_POST, []() {
    server.send(200, "text/plain", "OTA triggered");
    performOTA();
  });
  server.begin();
  Serial.println("[HTTP] Server ready. POST /ota-trigger to update.");
}
void loop() {
  server.handleClient();`;

const LOCKED_CLOSE = `}`;

const TEMPLATE: Chunk[] = [
  { kind: "locked", text: LOCKED_TOP },
  {
    kind: "editable",
    id: "codeConfiguration",
    placeholder: "// Global declarations, #define, sensor pins...",
    minHeight: LINE_H * 3,
  },
  { kind: "locked", text: LOCKED_MIDDLE_1 },
  {
    kind: "editable",
    id: "codeSetup",
    placeholder: "  // Your setup() code here...",
    minHeight: LINE_H * 3,
  },
  { kind: "locked", text: LOCKED_MIDDLE_2 },
  {
    kind: "editable",
    id: "codeLoop",
    placeholder: "  // Your loop() code here...",
    minHeight: LINE_H * 3,
  },
  { kind: "locked", text: LOCKED_CLOSE },
  {
    kind: "editable",
    id: "codeFuncs",
    placeholder: "// Additional helper functions...",
    minHeight: LINE_H * 4,
  },
];

type DiffLine =
  | { type: "same"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string };

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length,
    n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const result: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "same", text: oldLines[i++] });
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: "added", text: newLines[j++] });
    } else {
      result.push({ type: "removed", text: oldLines[i++] });
    }
  }
  return result;
}

function hasDiff(a: string, b: string) {
  return a.trimEnd() !== b.trimEnd();
}

const TOKEN_PATTERNS: [string, RegExp][] = [
  ["comment", /^\/\/.*/],
  ["templatevar", /^<%=\s*\w+\s*%>/],
  ["string", /^"(?:[^"\\]|\\.)*"/],
  ["string", /^'(?:[^'\\]|\\.)*'/],
  [
    "keyword",
    /^\b(void|const|char|int|float|bool|return|if|else|while|for|switch|case|break|static|nullptr|true|false|class|struct|new|delete|public|private|protected)\b/,
  ],
  ["macro", /^#\w+/],
  ["number", /^\b\d+\b/],
  ["punct", /^[(){}[\];,]/],
  ["word", /^\w+/],
  ["space", /^\s+/],
  ["other", /^./],
];

const TOKEN_COLORS: Record<string, string> = {
  keyword: "#4a6d8a",
  macro: "#5a7d6a",
  string: "#4a7a5a",
  comment: "#3a5040",
  templatevar: "#7a8a3a",
  number: "#4a5d8a",
  punct: "#3d4d5d",
  word: "#4a5568",
  space: "inherit",
  other: "#4a5568",
};

function tokenize(text: string) {
  const tokens: { type: string; value: string }[] = [];
  let rest = text;
  while (rest.length) {
    for (const [type, re] of TOKEN_PATTERNS) {
      const m = rest.match(re);
      if (m) {
        tokens.push({ type, value: m[0] });
        rest = rest.slice(m[0].length);
        break;
      }
    }
  }
  return tokens;
}

function HighlightedLine({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((tok, i) => (
        <span key={i} style={{ color: TOKEN_COLORS[tok.type] }}>
          {tok.value}
        </span>
      ))}
    </>
  );
}

function LineNumbers({ count, offset }: { count: number; offset: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={offset + i}
          className="text-right pr-3 pl-2 select-none font-mono"
          style={{
            height: LINE_H,
            lineHeight: `${LINE_H}px`,
            fontSize: 11,
            color: "#2e3a4a",
          }}
        >
          {offset + i}
        </div>
      ))}
    </>
  );
}

function LockedBlock({ text }: { text: string }) {
  return (
    <div className="relative bg-[#0d1117] border-l-2 border-[#1e2d3d]">
      <div
        className="absolute top-1 right-2 text-[9px] tracking-widest select-none pointer-events-none"
        style={{
          color: "#1e2d3d",
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
        }}
      >
        🔒 LOCKED
      </div>
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className="pl-5 pr-20 font-mono cursor-not-allowed select-none"
          style={{
            height: LINE_H,
            lineHeight: `${LINE_H}px`,
            fontSize: 13,
            whiteSpace: "pre",
          }}
        >
          <HighlightedLine text={line} />
        </div>
      ))}
    </div>
  );
}

interface EditableBlockProps {
  id: SegmentId;
  value: string;
  placeholder: string;
  minHeight: number;
  focused: boolean;
  onChange: (id: SegmentId, val: string) => void;
  onFocus: (id: SegmentId) => void;
  onBlur: () => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}

function EditableBlock({
  id,
  value,
  placeholder,
  minHeight,
  focused,
  onChange,
  onFocus,
  onBlur,
  textareaRef,
}: EditableBlockProps) {
  return (
    <div
      className={[
        "relative transition-colors duration-150",
        focused
          ? "bg-[#0c1825] border-l-2 border-[#30a0ff88]"
          : "bg-[#0b1520] border-l-2 border-[#30a0ff1a]",
      ].join(" ")}
    >
      <span
        className="absolute top-1 right-2 text-[9px] tracking-[1.5px] pointer-events-none select-none transition-colors duration-150"
        style={{
          color: focused ? "#30a0ff66" : "#30a0ff22",
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
        }}
      >
        ✎ EDITABLE
      </span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(id, e.target.value)}
        onFocus={() => onFocus(id)}
        onBlur={onBlur}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        className="w-full bg-transparent border-none outline-none resize-none overflow-hidden font-mono pl-5 pr-16"
        style={{
          fontSize: 13,
          lineHeight: `${LINE_H}px`,
          minHeight,
          caretColor: "#30a0ff",
          color: "#79b8ff",
        }}
      />
    </div>
  );
}

function ReadonlyCodePanel({ code }: { code: string }) {
  return (
    <div className="flex bg-[#0d1117] h-full">
      <div
        className="shrink-0 border-r border-[#1e2433] bg-[#0a0c10] select-none"
        style={{ minWidth: 44 }}
      >
        {code.split("\n").map((_, i) => (
          <div
            key={i}
            className="text-right pr-3 pl-2 select-none font-mono"
            style={{
              height: LINE_H,
              lineHeight: `${LINE_H}px`,
              fontSize: 11,
              color: "#2e3a4a",
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-x-auto">
        {code.split("\n").map((line, i) => (
          <div
            key={i}
            className="pl-4 pr-4 font-mono select-none"
            style={{
              height: LINE_H,
              lineHeight: `${LINE_H}px`,
              fontSize: 13,
              whiteSpace: "pre",
            }}
          >
            <HighlightedLine text={line} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = diffLines(oldText, newText);

  const bgMap = { same: "transparent", removed: "#3d0a0a", added: "#0a2d0a" };
  const borderMap = {
    same: "transparent",
    removed: "#ff5f5620",
    added: "#27c93f20",
  };
  const prefixMap = { same: " ", removed: "−", added: "+" };
  const prefixColorMap = {
    same: "#3a4a5a",
    removed: "#ff5f56aa",
    added: "#27c93faa",
  };
  const textColorMap = {
    same: "#4a5568",
    removed: "#ff8080aa",
    added: "#80ff80aa",
  };

  if (lines.every((l) => l.type === "same")) {
    return (
      <div
        className="flex items-center justify-center h-16 text-[12px] font-mono"
        style={{ color: "#445566" }}
      >
        No changes in this section
      </div>
    );
  }

  return (
    <div className="font-mono text-[12px]">
      {lines.map((line, i) => (
        <div
          key={i}
          className="flex gap-2 px-3"
          style={{
            background: bgMap[line.type],
            borderLeft: `2px solid ${borderMap[line.type]}`,
            height: LINE_H,
            lineHeight: `${LINE_H}px`,
            whiteSpace: "pre",
          }}
        >
          <span
            style={{
              color: prefixColorMap[line.type],
              width: 12,
              flexShrink: 0,
            }}
          >
            {prefixMap[line.type]}
          </span>
          <span style={{ color: textColorMap[line.type] }}>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

interface DiffModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentCode: string;
  incomingCode: string;
  submitState: "idle" | "loading" | "success" | "error";
}

function DiffModal({
  open,
  onClose,
  onConfirm,
  currentCode,
  incomingCode,
  submitState,
}: DiffModalProps) {
  const hasChanges = hasDiff(currentCode, incomingCode);
  const isFirstVersion = currentCode === "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v: any) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="border-[#1e2433] text-[#c9d1d9]"
        style={{
          background: "#0d1117",
          fontFamily: "'JetBrains Mono', monospace",
          maxWidth: 800,
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-[18px] uppercase tracking-[2px] text-[#e6edf3]"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Review Changes
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#445566]">
            {isFirstVersion
              ? "No previous version on the server — this will be the first upload."
              : hasChanges
                ? "Review the diff between the current server version and your new code."
                : "No changes detected — your code is identical to the current version."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-105 w-full rounded-lg border border-[#1e2433] mt-2">
          <div className="p-0">
            {isFirstVersion ? (
              <div>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <span
                    className="text-[11px] uppercase tracking-widest"
                    style={{
                      color: "#445566",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Full Sketch
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 border-[#27c93f33] text-[#27c93faa]"
                    style={{ background: "#0a1a0a" }}
                  >
                    NEW
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <DiffView oldText="" newText={incomingCode} />
                </div>
              </div>
            ) : (
              <div>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <span
                    className="text-[11px] uppercase tracking-widest"
                    style={{
                      color: "#445566",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Full Sketch Diff
                  </span>
                  {hasChanges ? (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-[#ffbd2e33] text-[#ffbd2eaa]"
                      style={{ background: "#2a2000" }}
                    >
                      MODIFIED
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-[#1e2d3d] text-[#2e3a4a]"
                      style={{ background: "transparent" }}
                    >
                      UNCHANGED
                    </Badge>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <DiffView oldText={currentCode} newText={incomingCode} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Button
          variant="outline"
          onClick={onClose}
          disabled={submitState === "loading"}
          className="border-[#1e2d3d] text-[#445566] hover:bg-[#1e2433] hover:text-[#778899] font-mono text-[11px] uppercase tracking-widest"
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={
            submitState === "loading" || (!isFirstVersion && !hasChanges)
          }
          className="font-mono text-[11px] uppercase tracking-widest"
          style={{
            background:
              submitState === "success"
                ? "#1a3d2b"
                : submitState === "error"
                  ? "#3d1a1a"
                  : "#1a2d10",
            border:
              submitState === "success"
                ? "1px solid #27c93f88"
                : submitState === "error"
                  ? "1px solid #ff5f5688"
                  : "1px solid #4aaa2055",
            color:
              submitState === "success"
                ? "#27c93fcc"
                : submitState === "error"
                  ? "#ff5f56cc"
                  : "#4aaa20cc",
          }}
        >
          {submitState === "loading"
            ? "⟳ Sending..."
            : submitState === "success"
              ? "✓ Submitted!"
              : submitState === "error"
                ? "✕ Failed — Retry"
                : "⬆ Confirm & Submit"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function App({ defaultValues, onChange }: ESPEditorProps) {
  const [values, setValues] = useState<ESPEditorValues>({
    ...EMPTY_VALUES,
    ...defaultValues,
  });
  const [focused, setFocused] = useState<SegmentId | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitState, setSubmitState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [lastVersion, setLastVersion] = useState<LastVersionState>({
    status: "loading",
  });

  const textareaRefs = useRef<
    Partial<Record<SegmentId, HTMLTextAreaElement | null>>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("http://localhost:5500/last-version", {
          signal: controller.signal,
        });

        if (!res.ok) {
          setLastVersion({
            status: "error",
            message: `HTTP ${res.status}: ${res.statusText}`,
          });
          return;
        }

        const text = await res.text();

        if (
          !text ||
          text.trim() === "" ||
          text.trim() === "No versions found."
        ) {
          setLastVersion({ status: "empty" });
          return;
        }

        setLastVersion({ status: "loaded", code: text });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setLastVersion({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();

    return () => controller.abort();
  }, [values]);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((el) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [values]);

  const handleChange = useCallback(
    (id: SegmentId, val: string) => {
      setValues((prev) => {
        const next = { ...prev, [id]: val };
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  const handleCopy = useCallback(async () => {
    const full = TEMPLATE.map((chunk) =>
      chunk.kind === "locked" ? chunk.text : values[chunk.id],
    ).join("\n");
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [values]);

  const handleSubmitClick = useCallback(() => {
    setSubmitState("idle");
    setModalOpen(true);
  }, []);

  const handleConfirmedSubmit = useCallback(async () => {
    setSubmitState("loading");
    try {
      const res = await fetch("http://localhost:5500/upload-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setSubmitState("success");
        setTimeout(() => {
          setModalOpen(false);
          setSubmitState("idle");
        }, 1500);
      } else {
        setSubmitState("error");
      }
    } catch {
      setSubmitState("error");
    }
  }, [values]);

  const lineCounts = TEMPLATE.map((chunk) => {
    if (chunk.kind === "locked") return chunk.text.split("\n").length;
    const text = values[chunk.id];
    const textLines = text ? text.split("\n").length : 1;
    return Math.max(textLines, Math.round(chunk.minHeight / LINE_H));
  });

  const lineOffsets: number[] = [];
  let cursor = 1;
  for (const count of lineCounts) {
    lineOffsets.push(cursor);
    cursor += count;
  }
  const totalLines = cursor - 1;

  const lastVersionFullCode =
    lastVersion.status === "loaded" ? lastVersion.code : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Rajdhani:wght@500;700&display=swap');
        textarea::placeholder { color: #1e3045; font-style: italic; }
      `}</style>

      <div
        className="min-h-screen bg-[#0a0c10] flex flex-col items-center px-4 py-8"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="w-full max-w-350 flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 bg-linear-to-br from-[#1e3a5f] to-[#0d2137] border border-[#30a0ff33] shadow-[0_0_18px_#30a0ff1a]">
            ⚡
          </div>
          <div>
            <h1
              className="text-[22px] font-bold uppercase tracking-[2px] text-[#e6edf3]"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              ESP32 OTA Sketch Editor
            </h1>
            <p className="text-[11px] tracking-widest mt-0.5 text-[#445566]">
              ESP32 OTA HTTPUpdate HTTPClient
            </p>
          </div>
          <div className="ml-auto flex gap-5">
            {[
              { label: "Locked", cls: "bg-[#1e2433] border border-[#334]" },
              {
                label: "Editable",
                cls: "bg-[#0d1f30] border border-[#30a0ff55]",
              },
            ].map(({ label, cls }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-[11px] text-[#778899]"
              >
                <div className={`w-2.5 h-2.5 rounded-[3px] ${cls}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-350 flex gap-4 items-start">
          <div
            className="flex-1 min-w-0 rounded-xl overflow-hidden border border-[#1e2433] flex flex-col"
            style={{ boxShadow: "0 8px 40px #00000060" }}
          >
            <div className="h-10 bg-[#111520] border-b border-[#1e2433] flex items-center px-4 gap-3 shrink-0">
              <div
                className="flex items-center gap-2 h-full px-4 text-[12px] bg-[#161b22] border-r border-[#1e2433]"
                style={{
                  borderBottom: "2px solid #445566",
                  marginBottom: -1,
                  color: "#778899",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#445566]" />
                last-version.ino
              </div>
              <div className="ml-auto">
                {lastVersion.status === "loading" && (
                  <span className="text-[10px] text-[#445566] animate-pulse">
                    Fetching...
                  </span>
                )}
                {lastVersion.status === "empty" && (
                  <Badge
                    variant="outline"
                    className="text-[9px] border-[#ffbd2e33] text-[#ffbd2eaa]"
                    style={{ background: "#2a2000" }}
                  >
                    NO VERSIONS FOUND
                  </Badge>
                )}
                {lastVersion.status === "error" && (
                  <Badge
                    variant="outline"
                    className="text-[9px] border-[#ff5f5633] text-[#ff5f56aa]"
                    style={{ background: "#2a0000" }}
                  >
                    FETCH ERROR
                  </Badge>
                )}
                {lastVersion.status === "loaded" && (
                  <Badge
                    variant="outline"
                    className="text-[9px] border-[#27c93f33] text-[#27c93faa]"
                    style={{ background: "#0a1a0a" }}
                  >
                    LOADED
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5 ml-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f5644]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e44]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f44]" />
              </div>
            </div>

            <div
              className="bg-[#0d1117] flex-1 overflow-auto"
              style={{ minHeight: 400 }}
            >
              {lastVersion.status === "loading" && (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <div className="w-5 h-5 border-2 border-[#30a0ff44] border-t-[#30a0ff] rounded-full animate-spin" />
                  <span className="text-[12px] text-[#2e3a4a]">
                    Loading last version...
                  </span>
                </div>
              )}
              {lastVersion.status === "empty" && (
                <div className="flex flex-col items-center justify-center h-64 gap-2">
                  <span className="text-2xl">📭</span>
                  <span className="text-[13px] text-[#445566]">
                    No versions found
                  </span>
                  <span className="text-[11px] text-[#2e3a4a]">
                    Submit your first version using the editor →
                  </span>
                </div>
              )}
              {lastVersion.status === "error" && (
                <div className="flex flex-col items-center justify-center h-64 gap-2">
                  <span className="text-2xl">⚠️</span>
                  <span className="text-[13px] text-[#ff5f56aa]">
                    Could not fetch last version
                  </span>
                  <span className="text-[11px] text-[#445566] max-w-65 text-center">
                    {lastVersion.message}
                  </span>
                </div>
              )}
              {lastVersion.status === "loaded" && (
                <ReadonlyCodePanel code={lastVersionFullCode} />
              )}
            </div>
          </div>

          <div
            className="flex-1 min-w-0 rounded-xl overflow-hidden border border-[#1e2433]"
            style={{ boxShadow: "0 8px 60px #00000080, 0 0 0 1px #30a0ff11" }}
          >
            <div className="h-10 bg-[#111520] border-b border-[#1e2433] flex items-center px-4">
              <div
                className="flex items-center gap-2 h-full px-4 text-[12px] text-[#e6edf3] bg-[#161b22] border-r border-[#1e2433]"
                style={{ borderBottom: "2px solid #30a0ff", marginBottom: -1 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#30a0ff]" />
                sketch.ino
              </div>
              <div className="ml-auto flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
            </div>

            <div className="flex bg-[#0d1117]">
              <div
                className="shrink-0 border-r border-[#1e2433] bg-[#0a0c10] select-none"
                style={{ minWidth: 52 }}
              >
                {TEMPLATE.map((_, i) => (
                  <LineNumbers
                    key={i}
                    count={lineCounts[i]}
                    offset={lineOffsets[i]}
                  />
                ))}
              </div>
              <div className="flex-1 overflow-x-auto min-w-0">
                {TEMPLATE.map((chunk, i) =>
                  chunk.kind === "locked" ? (
                    <LockedBlock key={i} text={chunk.text} />
                  ) : (
                    <EditableBlock
                      key={chunk.id}
                      id={chunk.id}
                      value={values[chunk.id]}
                      placeholder={chunk.placeholder}
                      minHeight={chunk.minHeight}
                      focused={focused === chunk.id}
                      onChange={handleChange}
                      onFocus={setFocused}
                      onBlur={() => setFocused(null)}
                      textareaRef={(el) => {
                        textareaRefs.current[chunk.id] = el;
                      }}
                    />
                  ),
                )}
              </div>
            </div>

            <div className="bg-[#111520] border-t border-[#1e2433] px-4 py-1.5 flex items-center gap-6">
              <div className="flex items-center gap-1.5 text-[11px] text-[#445566]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#27c93f] shadow-[0_0_6px_#27c93f]" />
                Ready
              </div>
              <span className="text-[11px] text-[#445566]">C++ / ESP</span>
              <span className="text-[11px] text-[#445566]">
                {totalLines} lines
              </span>
              {focused && (
                <span className="text-[11px] text-[#30a0ff88]">
                  ✎ Editing: {focused}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className={[
                    "text-[11px] font-bold tracking-[1.5px] uppercase px-3.5 py-1 rounded border transition-all duration-150",
                    copied
                      ? "bg-[#1a3d2b] border-[#27c93f55] text-[#27c93f99]"
                      : "bg-[#1e2d3d] border-[#30a0ff33] text-[#30a0ff99] hover:bg-[#243747] hover:border-[#30a0ff66] hover:text-[#30a0ffcc]",
                  ].join(" ")}
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  {copied ? "✓ Copied!" : "Copy Code"}
                </button>

                <button
                  onClick={handleSubmitClick}
                  className="text-[11px] font-bold tracking-[1.5px] uppercase px-3.5 py-1 rounded border transition-all duration-150 bg-[#1a2d10] border-[#4aaa2033] text-[#4aaa2099] hover:bg-[#223516] hover:border-[#4aaa2066] hover:text-[#4aaa20cc]"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  ⬆ Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DiffModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmedSubmit}
        currentCode={lastVersionFullCode}
        incomingCode={TEMPLATE.map((chunk) =>
          chunk.kind === "locked" ? chunk.text : values[chunk.id],
        ).join("\n")}
        submitState={submitState}
      />
    </>
  );
}
