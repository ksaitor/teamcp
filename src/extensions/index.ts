import type { ReactNode } from "react";

/**
 * Extension registry for runtime customizations.
 *
 * Operators may register optional hooks to inject behavior at well-defined
 * points in the app: seat policies, UI slots, authorization, and telemetry.
 * All hooks are optional; the registry is empty by default and the app falls
 * back to standard behavior with nothing registered.
 *
 * Register hooks at startup — typically from a Next.js `instrumentation.ts`
 * file — by calling `registerExtensions({...})`. Hook stability is treated as
 * a public API contract: breaking changes require a major-version bump.
 */

export interface ToolCallEvent {
  organizationId: string;
  membershipId: string;
  connectorId: string | null;
  toolName: string;
  durationMs: number;
  status: "ok" | "denied" | "filtered" | "queued" | "error";
}

export type SeatDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface Extensions {
  // Seat / membership policy
  canAddSeat?: (organizationId: string) => Promise<SeatDecision>;

  // Connector policy — same decision shape as seats
  canAddConnector?: (organizationId: string) => Promise<SeatDecision>;

  // S3 backup destinations — gate scheduled/remote backups behind a plan.
  // Unset (open-core default) means allowed; cloud registers a billing check.
  canUseS3Backups?: (organizationId: string) => Promise<SeatDecision>;

  // UI slots — return null/undefined to render nothing
  renderPublicHome?: () => ReactNode | Promise<ReactNode>;
  renderSettingsExtras?: (organizationId: string) => ReactNode | Promise<ReactNode>;

  // Authorization
  isSuperAdmin?: (userId: string) => Promise<boolean>;

  // Telemetry (fire-and-forget; never blocks the caller)
  onToolCall?: (event: ToolCallEvent) => void;
  onSignup?: (userId: string) => void;
  onMembershipAdded?: (organizationId: string, userId: string) => void;
  onMembershipRemoved?: (organizationId: string, userId: string) => void;
}

const registry: Extensions = {};

export function registerExtensions(ext: Partial<Extensions>): void {
  Object.assign(registry, ext);
}

export const extensions: Readonly<Extensions> = registry;
