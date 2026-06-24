import next from "next";
import { createServer } from "http";
import { ZodError } from "zod";
import { getConfig } from "./src/lib/config";
import { handleMcpRequest, closeMcpSessions } from "./src/server";
import { startChannelSupervisor, stopChannelSupervisor } from "./src/channels/supervisor";
import { startAuditLogRetention } from "./src/audit/retention";
import { prisma } from "./src/db";

// Validate required env up front so a misconfigured deploy fails at boot with
// a clear message instead of at first use (e.g. first credential encryption).
try {
  getConfig();
} catch (err) {
  if (err instanceof ZodError) {
    console.error("Invalid environment configuration:");
    for (const issue of err.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
  } else {
    console.error("Invalid environment configuration:", err);
  }
  process.exit(1);
}

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

// Drive long-lived per-channel runners (e.g. Telegram polling) in-process;
// no-ops when no channel needs a runner (e.g. webhook delivery), so no env gate
// is needed.
startChannelSupervisor();
startAuditLogRetention();

const server = createServer((req, res) => {
  const path = new URL(req.url || "/", "http://localhost").pathname;

  if (path === "/health" || path.startsWith("/mcp/")) {
    void handleMcpRequest(req, res);
    return;
  }

  void handle(req, res);
}).listen(port, () => {
  console.log(`Teamcp listening on :${port}`);
});

// Graceful shutdown: stop accepting connections, end live MCP/SSE streams,
// then disconnect from the DB. Force-exit if draining takes too long so
// orchestrators don't have to SIGKILL.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down…`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out, exiting forcefully");
    process.exit(1);
  }, 5000);
  forceExit.unref();

  // Stop channel runners first so Telegram long-polls / Slack sockets close and
  // the platform releases each bot's single-consumer slot before a redeploy's
  // new instance connects (prevents Telegram 409 "terminated by other getUpdates").
  await stopChannelSupervisor();
  await closeMcpSessions();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
