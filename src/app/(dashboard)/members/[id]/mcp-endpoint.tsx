"use client";

import { useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";

export function McpEndpoint({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; silently ignore.
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="block flex-1 break-all text-sm">{endpoint}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy endpoint URL"}
        title={copied ? "Copied" : "Copy to clipboard"}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? (
          <FiCheck className="h-4 w-4 text-success" />
        ) : (
          <FiCopy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
