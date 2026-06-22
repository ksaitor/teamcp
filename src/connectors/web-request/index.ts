import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  WebRequestConfig,
  WebRequestCredentials,
  ParamDef,
} from "./types";

const MAX_RESPONSE_BYTES = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;

function asConfig(config: ConnectorConfig): WebRequestConfig {
  return config as unknown as WebRequestConfig;
}

function parseCreds(credentials: DecryptedCredentials): WebRequestCredentials {
  try {
    const parsed = JSON.parse(credentials.raw);
    if (parsed && typeof parsed.secret === "string") return parsed;
  } catch {
    // fall through
  }
  return { secret: "" };
}

function buildInputSchema(params: ParamDef[]): Tool["inputSchema"] {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = {
      type: p.type,
      ...(p.description ? { description: p.description } : {}),
    };
    if (p.required) required.push(p.name);
  }
  return {
    type: "object" as const,
    properties,
    ...(required.length ? { required } : {}),
  };
}

function applyAuthHeaders(
  headers: Record<string, string>,
  cfg: WebRequestConfig,
  creds: WebRequestCredentials
): void {
  const { auth } = cfg;
  const secret = creds.secret ?? "";
  switch (auth.type) {
    case "BEARER":
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      break;
    case "HEADER":
      if (auth.headerName && secret) headers[auth.headerName] = secret;
      break;
    case "BASIC":
      if (secret) {
        const encoded = Buffer.from(secret, "utf8").toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
      }
      break;
    case "NONE":
    default:
      break;
  }
}

function substitutePathParams(
  url: string,
  pathValues: Record<string, string>
): string {
  return url.replace(/\{([^}]+)\}/g, (_, name) => {
    const v = pathValues[name];
    return v === undefined ? "" : encodeURIComponent(v);
  });
}

async function readCappedText(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length <= MAX_RESPONSE_BYTES) return text;
  return text.slice(0, MAX_RESPONSE_BYTES) + "\n…[truncated]";
}

function formatBody(
  text: string,
  contentType: string | null
): string {
  if (contentType && contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export class WebRequestConnector implements ConnectorInstance {
  type = "WEB_REQUEST";

  listTools(config: ConnectorConfig): Tool[] {
    const cfg = asConfig(config);
    if (!cfg?.toolName) return [];
    return [
      {
        name: cfg.toolName,
        description: cfg.toolDescription || `Call ${cfg.method} ${cfg.url}`,
        inputSchema: buildInputSchema(cfg.params || []),
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [];
  }

  getOperationType(
    _toolName: string,
    config?: ConnectorConfig
  ): "read" | "write" {
    const method = config ? asConfig(config).method : undefined;
    return method === "GET" ? "read" : "write";
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    const cfg = asConfig(config);
    const creds = parseCreds(credentials);

    if (!cfg?.url || !cfg?.method) {
      return {
        content: [{ type: "text", text: "Web Request connector misconfigured" }],
        isError: true,
      };
    }
    if (cfg.toolName && toolName !== cfg.toolName) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const pathValues: Record<string, string> = {};
    const queryParams = new URLSearchParams();
    const bodyValues: Record<string, any> = {};

    for (const p of cfg.params || []) {
      if (!(p.name in params)) continue;
      const value = params[p.name];
      if (p.in === "path") {
        pathValues[p.name] = String(value);
      } else if (p.in === "query") {
        if (value !== undefined && value !== null) {
          queryParams.append(p.name, String(value));
        }
      } else if (p.in === "body") {
        bodyValues[p.name] = value;
      }
    }

    let finalUrl = substitutePathParams(cfg.url, pathValues);
    const qs = queryParams.toString();
    if (qs) finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;

    const headers: Record<string, string> = {};
    for (const h of cfg.staticHeaders || []) {
      if (h.name) headers[h.name] = h.value;
    }
    applyAuthHeaders(headers, cfg, creds);

    let body: string | undefined;
    const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(cfg.method);
    if (hasBody && Object.keys(bodyValues).length > 0) {
      if (cfg.bodyFormat === "form") {
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(bodyValues)) {
          if (v !== undefined && v !== null) form.append(k, String(v));
        }
        body = form.toString();
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      } else {
        body = JSON.stringify(bodyValues);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(finalUrl, {
        method: cfg.method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await readCappedText(res);
      const formatted = formatBody(text, res.headers.get("content-type"));

      if (!res.ok) {
        return {
          content: [
            {
              type: "text",
              text: `HTTP ${res.status} ${res.statusText}\n${formatted}`,
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: formatted }] };
    } catch (error: any) {
      const message =
        error?.name === "AbortError"
          ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : `Request failed: ${error?.message || String(error)}`;
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    const cfg = asConfig(config);
    if (!cfg?.url) return false;
    if (/\{[^}]+\}/.test(cfg.url)) {
      // Path placeholders need member input; can't meaningfully test here.
      return true;
    }
    const creds = parseCreds(credentials);
    const headers: Record<string, string> = {};
    for (const h of cfg.staticHeaders || []) {
      if (h.name) headers[h.name] = h.value;
    }
    applyAuthHeaders(headers, cfg, creds);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(cfg.url, {
        method: cfg.method === "GET" ? "GET" : "HEAD",
        headers,
        signal: controller.signal,
      });
      return res.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

export default new WebRequestConnector();
