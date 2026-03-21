import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await requireAdmin();

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    include: { settings: true },
  });

  if (!org) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="mt-6 max-w-xl space-y-6">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <h2 className="font-semibold">Organization</h2>
          <p className="mt-1 text-sm text-gray-500">
            <strong>{org.name}</strong> ({org.slug})
          </p>
        </div>

        {org.settings && <SettingsForm settings={org.settings} />}
      </div>
    </div>
  );
}
