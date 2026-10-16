import api from "@/lib/api-client";

type Level = "warn" | "error";

// Logs to the console and forwards to the server (POST /client-logs) so
// client-side problems reach the server logs. Never throws; a failed report is
// only written to the console (no re-reporting, to avoid loops).
function report(level: Level, context: string, message: string, err?: unknown) {
  const logFn = level === "error" ? console.error : console.warn;
  logFn(`[${context}] ${message}`, err ?? "");

  const e = err instanceof Error ? err : undefined;
  api
    .post("/client-logs", {
      level,
      context,
      message: e ? `${message}: ${e.message}` : message,
      stack: e?.stack,
      url: globalThis.location?.pathname,
    })
    .catch((sendErr) =>
      console.warn("[client-logger] failed to send log to server", sendErr),
    );
}

export const clientLogger = {
  warn: (context: string, message: string, err?: unknown) =>
    report("warn", context, message, err),
  error: (context: string, message: string, err?: unknown) =>
    report("error", context, message, err),
};
