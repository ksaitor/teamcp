import next from "next";
import { createServer } from "http";
import { handleMcpRequest } from "./src/server";
import { startChannelSupervisor } from "./src/channels/supervisor";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

// Drive long-lived per-channel runners (e.g. Telegram polling) in-process;
// no-ops when no channel needs a runner (e.g. webhook delivery), so no env gate
// is needed.
startChannelSupervisor();

createServer((req, res) => {
  const path = new URL(req.url || "/", "http://localhost").pathname;

  if (path === "/health" || path.startsWith("/mcp/")) {
    void handleMcpRequest(req, res);
    return;
  }

  void handle(req, res);
}).listen(port, () => {
  console.log(`TeamRouter listening on :${port}`);
});
