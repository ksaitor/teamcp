import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ChannelsTable } from "./channels-table";

export default async function ChannelsPage() {
  const session = await requireAdmin();

  const channels = await prisma.channel.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { identities: true, conversations: true } },
    },
  });

  if (channels.length === 0) {
    redirect("/channels/new");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Channels</h1>
        <Link
          href="/channels/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add channel
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Each channel is a chat surface (web, Telegram bot, Slack app, WhatsApp)
        where your team can talk to an LLM that calls only the tools you've
        permitted. Bot channels are tenant-owned — paste in your own bot
        credentials.
      </p>

      <div className="mt-6">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels yet.</p>
        ) : (
          <ChannelsTable
            channels={channels.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              status: c.status,
              identities: c._count.identities,
              conversations: c._count.conversations,
            }))}
          />
        )}
      </div>
    </div>
  );
}
