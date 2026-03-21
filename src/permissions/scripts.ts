import type { PermissionResult } from "./engine";

interface ScriptContext {
  member: { id: string; name: string; email: string };
  connector: { id: string; name: string; type: string };
  toolName: string;
  params: Record<string, any>;
  operation: "read" | "write";
}

/**
 * Layer 3: Run custom permission scripts in a restricted environment.
 * Scripts are admin-defined functions that return { allow, reason?, filterFields? }.
 *
 * NOTE: `new Function()` is NOT a true sandbox — admins with script access
 * can potentially access Node.js globals. This is acceptable since only
 * OWNER/ADMIN roles can set scripts, but it should be replaced with
 * isolated-vm or a WASM runtime for production hardening.
 */
export async function runCustomScript(
  script: string,
  context: ScriptContext
): Promise<PermissionResult> {
  try {
    // Block obvious escape attempts in the script source
    const blocked = [
      "process", "require", "import", "globalThis", "global",
      "child_process", "eval(", "Function(",
    ];
    for (const keyword of blocked) {
      if (script.includes(keyword)) {
        return {
          allowed: false,
          reason: `Permission script contains blocked keyword: ${keyword}`,
          layer: "script",
        };
      }
    }

    const fn = new Function(
      "context",
      `"use strict";
      const { member, connector, toolName, params, operation } = context;
      ${script}`
    );

    // Execute with a timeout
    const timeoutMs = 100;
    const result = await Promise.race([
      Promise.resolve(fn(context)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Script timeout")), timeoutMs)
      ),
    ]);

    if (typeof result === "object" && result !== null && "allow" in result) {
      return {
        allowed: result.allow,
        reason: result.reason,
        filterFields: result.filterFields,
        layer: "script",
      };
    }

    // If script doesn't return expected shape, default to deny
    return {
      allowed: false,
      reason: "Permission script returned invalid result",
      layer: "script",
    };
  } catch (error: any) {
    return {
      allowed: false,
      reason: `Permission script error: ${error.message}`,
      layer: "script",
    };
  }
}
