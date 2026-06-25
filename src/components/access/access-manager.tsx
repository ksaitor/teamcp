"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessRow, type AccessRecord } from "./access-row";
import { MultiSelectAdd } from "./multi-select-add";

export type Axis = "members" | "connectors";

export interface AccessCandidate {
  id: string;
  label: string;
  sublabel?: string;
  connectorType: string;
}

interface AccessManagerProps {
  axis: Axis;
  /** Set when axis="members" (connector is fixed). */
  fixedConnectorId?: string;
  /** Set when axis="connectors" (member is fixed). */
  fixedMembershipId?: string;
  records: AccessRecord[];
  candidates: AccessCandidate[];
  /** Section heading rendered on the same line as the search field. */
  title?: string;
  /** Optional description rendered under the heading. */
  description?: string;
}

export function AccessManager({
  axis,
  fixedConnectorId,
  fixedMembershipId,
  records,
  candidates,
  title,
  description,
}: AccessManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function resolve(itemId: string): { membershipId: string; connectorId: string } {
    return axis === "members"
      ? { membershipId: itemId, connectorId: fixedConnectorId! }
      : { membershipId: fixedMembershipId!, connectorId: itemId };
  }

  async function addAccess(ids: string[]) {
    for (const itemId of ids) {
      const { membershipId, connectorId } = resolve(itemId);
      await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, connectorId }),
      });
    }
    router.refresh();
  }

  const addLabel = axis === "members" ? "Add team member" : "Add connector";

  const q = query.trim().toLowerCase();
  const filteredRecords = q
    ? records.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          (r.sublabel || "").toLowerCase().includes(q)
      )
    : records;

  return (
    <div className="space-y-4">
      {(title || records.length > 0) && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            {title && (
              <h2 className="shrink-0 text-lg font-semibold">{title}</h2>
            )}
            {records.length > 0 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  axis === "members"
                    ? "Search team members…"
                    : "Search connectors…"
                }
                className="w-full max-w-xs rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
              />
            )}
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {records.length === 0 && candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {axis === "members"
            ? "No team members to grant access to yet."
            : "No connectors configured yet."}
        </p>
      ) : (
        <>
          {records.length > 0 && (
            <>
              {filteredRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matches for &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredRecords.map((record) => {
                    const { membershipId, connectorId } = resolve(record.id);
                    return (
                      <AccessRow
                        key={record.id}
                        record={record}
                        membershipId={membershipId}
                        connectorId={connectorId}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          <MultiSelectAdd
            candidates={candidates}
            addLabel={addLabel}
            onAdd={addAccess}
          />
        </>
      )}
    </div>
  );
}
