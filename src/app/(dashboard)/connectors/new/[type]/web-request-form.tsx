"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import type {
  AuthType,
  BodyFormat,
  HttpMethod,
  ParamDef,
  ParamLocation,
  ParamType,
  StaticHeader,
  WebRequestConfig,
} from "@/connectors/web-request/types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none";
const labelClass = "block text-xs font-medium text-muted-foreground";

function toSnakeCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

export function WebRequestForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolNameTouched, setToolNameTouched] = useState(false);
  const [toolDescription, setToolDescription] = useState("");

  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");

  const [authType, setAuthType] = useState<AuthType>("NONE");
  const [bearerToken, setBearerToken] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [basicUser, setBasicUser] = useState("");
  const [basicPass, setBasicPass] = useState("");

  const [bodyFormat, setBodyFormat] = useState<BodyFormat>("json");
  const [params, setParams] = useState<ParamDef[]>([]);
  const [staticHeaders, setStaticHeaders] = useState<StaticHeader[]>([]);

  const hasBody = method !== "GET";

  function onNameBlur() {
    if (!toolNameTouched && name) {
      setToolName(toSnakeCase(name));
    }
  }

  function addParam() {
    setParams((rows) => [
      ...rows,
      { name: "", in: "query", type: "string", required: false, description: "" },
    ]);
  }
  function updateParam(i: number, patch: Partial<ParamDef>) {
    setParams((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeParam(i: number) {
    setParams((rows) => rows.filter((_, idx) => idx !== i));
  }

  function addHeader() {
    setStaticHeaders((rows) => [...rows, { name: "", value: "" }]);
  }
  function updateHeader(i: number, patch: Partial<StaticHeader>) {
    setStaticHeaders((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  }
  function removeHeader(i: number) {
    setStaticHeaders((rows) => rows.filter((_, idx) => idx !== i));
  }

  function buildSecret(): string {
    switch (authType) {
      case "BEARER":
        return bearerToken;
      case "HEADER":
        return headerValue;
      case "BASIC":
        return `${basicUser}:${basicPass}`;
      default:
        return "";
    }
  }

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (!url.trim()) return "URL is required";
    try {
      new URL(url);
    } catch {
      return "URL must be a valid absolute URL";
    }
    const finalToolName = toolName.trim() || toSnakeCase(name);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(finalToolName)) {
      return "Tool name must start with a letter/underscore and contain only letters, numbers, underscores";
    }
    const seen = new Set<string>();
    for (const p of params) {
      if (!p.name.trim()) return "Every parameter needs a name";
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.name)) {
        return `Parameter "${p.name}" has an invalid name`;
      }
      if (seen.has(p.name)) return `Duplicate parameter name: ${p.name}`;
      seen.add(p.name);
    }
    if (authType === "HEADER" && !headerName.trim()) {
      return "Custom header requires a header name";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);

    const finalToolName = toolName.trim() || toSnakeCase(name);
    const config: WebRequestConfig = {
      url: url.trim(),
      method,
      toolName: finalToolName,
      toolDescription: toolDescription.trim(),
      staticHeaders: staticHeaders.filter((h) => h.name.trim()),
      auth: {
        type: authType,
        ...(authType === "HEADER" ? { headerName: headerName.trim() } : {}),
      },
      params: params.map((p) => ({
        ...p,
        name: p.name.trim(),
        description: p.description?.trim() || undefined,
      })),
      bodyFormat,
    };

    const credentials = JSON.stringify({ secret: buildSecret() });

    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        type: "WEB_REQUEST",
        credentials,
        config,
      }),
    });

    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Failed to add connector"
      );
      return;
    }

    router.push("/connectors");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6" autoComplete="off">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Basics</h2>
        <div>
          <label className={labelClass}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onNameBlur}
            required
            placeholder="e.g., Lookup customer by ID"
            className={`${inputClass} mt-1`}
            data-1p-ignore
          />
        </div>
        <div>
          <label className={labelClass}>Tool name (exposed to the LLM)</label>
          <input
            value={toolName}
            onChange={(e) => {
              setToolName(e.target.value);
              setToolNameTouched(true);
            }}
            placeholder="lookup_customer"
            className={`${inputClass} mt-1 font-mono`}
            data-1p-ignore
          />
        </div>
        <div>
          <label className={labelClass}>Tool description</label>
          <textarea
            value={toolDescription}
            onChange={(e) => setToolDescription(e.target.value)}
            rows={2}
            placeholder="What this endpoint does — shown to the LLM."
            className={`${inputClass} mt-1`}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Request</h2>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <div>
            <label className={labelClass}>Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={`${inputClass} mt-1`}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://api.example.com/customers/{id}"
              className={`${inputClass} mt-1 font-mono`}
              data-1p-ignore
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Use <code className="rounded bg-muted px-1">{"{name}"}</code> in the
          URL for path parameters.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Authentication</h2>
        <div>
          <label className={labelClass}>Auth type</label>
          <select
            value={authType}
            onChange={(e) => setAuthType(e.target.value as AuthType)}
            className={`${inputClass} mt-1`}
          >
            <option value="NONE">None</option>
            <option value="BEARER">Bearer token</option>
            <option value="HEADER">Custom header</option>
            <option value="BASIC">Basic auth</option>
          </select>
        </div>

        {authType === "BEARER" && (
          <div>
            <label className={labelClass}>Token</label>
            <input
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              required
              placeholder="sk_…"
              autoComplete="new-password"
              className={`${inputClass} mt-1 font-mono`}
              data-1p-ignore
            />
          </div>
        )}

        {authType === "HEADER" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Header name</label>
              <input
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                required
                placeholder="X-API-Key"
                className={`${inputClass} mt-1 font-mono`}
                data-1p-ignore
              />
            </div>
            <div>
              <label className={labelClass}>Value</label>
              <input
                type="password"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
                required
                autoComplete="new-password"
                className={`${inputClass} mt-1 font-mono`}
                data-1p-ignore
              />
            </div>
          </div>
        )}

        {authType === "BASIC" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Username</label>
              <input
                value={basicUser}
                onChange={(e) => setBasicUser(e.target.value)}
                required
                className={`${inputClass} mt-1`}
                data-1p-ignore
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={basicPass}
                onChange={(e) => setBasicPass(e.target.value)}
                required
                autoComplete="new-password"
                className={`${inputClass} mt-1`}
                data-1p-ignore
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Parameters</h2>
          <Button type="button" variant="outline" size="sm" onClick={addParam}>
            <FiPlus /> Add parameter
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Inputs the LLM can supply at call time. Become the tool&apos;s typed
          input schema.
        </p>
        {params.length === 0 ? (
          <p className="text-sm text-muted-foreground">No parameters yet.</p>
        ) : (
          <div className="space-y-2">
            {params.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_7rem_6rem_5rem_1.5fr_auto] items-end gap-2 rounded-md border border-border p-2"
              >
                <div>
                  <label className={labelClass}>Name</label>
                  <input
                    value={p.name}
                    onChange={(e) => updateParam(i, { name: e.target.value })}
                    className={`${inputClass} mt-1 font-mono`}
                    placeholder="id"
                  />
                </div>
                <div>
                  <label className={labelClass}>In</label>
                  <select
                    value={p.in}
                    onChange={(e) =>
                      updateParam(i, { in: e.target.value as ParamLocation })
                    }
                    className={`${inputClass} mt-1`}
                  >
                    <option value="query">query</option>
                    <option value="path">path</option>
                    <option value="body">body</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    value={p.type}
                    onChange={(e) =>
                      updateParam(i, { type: e.target.value as ParamType })
                    }
                    className={`${inputClass} mt-1`}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Required</label>
                  <div className="mt-1 flex h-[34px] items-center">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={(e) =>
                        updateParam(i, { required: e.target.checked })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input
                    value={p.description || ""}
                    onChange={(e) =>
                      updateParam(i, { description: e.target.value })
                    }
                    className={`${inputClass} mt-1`}
                    placeholder="What it means"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeParam(i)}
                  aria-label="Remove parameter"
                >
                  <FiTrash2 />
                </Button>
              </div>
            ))}
          </div>
        )}

        {hasBody && params.some((p) => p.in === "body") && (
          <div className="max-w-xs">
            <label className={labelClass}>Body format</label>
            <select
              value={bodyFormat}
              onChange={(e) => setBodyFormat(e.target.value as BodyFormat)}
              className={`${inputClass} mt-1`}
            >
              <option value="json">JSON</option>
              <option value="form">Form-encoded</option>
            </select>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Static headers</h2>
          <Button type="button" variant="outline" size="sm" onClick={addHeader}>
            <FiPlus /> Add header
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sent with every request. Don&apos;t put secrets here — use the auth
          section above.
        </p>
        {staticHeaders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No headers.</p>
        ) : (
          <div className="space-y-2">
            {staticHeaders.map((h, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
              >
                <div>
                  <label className={labelClass}>Name</label>
                  <input
                    value={h.name}
                    onChange={(e) => updateHeader(i, { name: e.target.value })}
                    className={`${inputClass} mt-1 font-mono`}
                    placeholder="Accept"
                  />
                </div>
                <div>
                  <label className={labelClass}>Value</label>
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    className={`${inputClass} mt-1 font-mono`}
                    placeholder="application/json"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeHeader(i)}
                  aria-label="Remove header"
                >
                  <FiTrash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Adding…" : "Add connector"}
        </Button>
      </div>
    </form>
  );
}
