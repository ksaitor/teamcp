import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

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
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Identities</th>
                <th className="pb-2 font-medium">Conversations</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {channels.map((c) => (
                <tr key={c.id}>
                  <td className="py-3">
                    <Link
                      href={`/channels/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 text-muted-foreground">{c.type}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === "ACTIVE"
                          ? "bg-success/10 text-success"
                          : c.status === "ERROR"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {c._count.identities}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {c._count.conversations}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/channels/${c.id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Configure
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
