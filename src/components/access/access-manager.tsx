"use client";

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
}

export function AccessManager({
  axis,
  fixedConnectorId,
  fixedMembershipId,
  records,
  candidates,
}: AccessManagerProps) {
  const router = useRouter();

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

  return (
    <div className="space-y-4">
      {records.length === 0 && candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {axis === "members"
            ? "No team members to grant access to yet."
            : "No connectors configured yet."}
        </p>
      ) : (
        <>
          {records.length > 0 && (
            <div className="space-y-2">
              {records.map((record) => {
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
