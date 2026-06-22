import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/db";
import { NewChannelForm } from "./new-channel-form";

export default async function NewChannelPage() {
  const session = await requireAdmin();

  // Each channel type is limited to one per org (enforced in the API). Tell the
  // form which types are already taken so it can lock those options out.
  const existing = await prisma.channel.findMany({
    where: { organizationId: session.organizationId },
    select: { type: true },
  });
  const existingTypes = [...new Set(existing.map((c) => c.type))];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Add channel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick where your team will chat. The web channel works inside this app
        with no setup. Bot channels need credentials from the bot platform.
      </p>

      <NewChannelForm existingTypes={existingTypes} />
    </div>
  );
}
