import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AddMemberForm } from "../add-member-form";

export default async function NewMemberPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/members"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to members
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Add member</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite a teammate to your organization.
      </p>

      <div className="mt-6">
        <AddMemberForm mode="standalone" />
      </div>
    </div>
  );
}
