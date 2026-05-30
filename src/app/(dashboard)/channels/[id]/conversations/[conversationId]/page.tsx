import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string; conversationId: string }>;
}) {
  const session = await requireAdmin();
  const { id, conversationId } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      channelId: id,
      channel: { organizationId: session.organizationId },
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      membership: {
        include: { user: { select: { name: true, email: true } } },
      },
      channel: { select: { name: true } },
    },
  });

  if (!conversation) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{conversation.title || "Conversation"}</h1>
        <Link
          href={`/channels/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to channel
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {conversation.channel.name} · {conversation.membership.user.email}
      </p>

      <div className="space-y-3">
        {conversation.messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages.</p>
        )}
        {conversation.messages.map((m) => (
          <div
            key={m.id}
            className="rounded-md border border-border bg-card p-3 text-sm"
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                {m.role}
              </span>
              {m.toolName && (
                <span className="font-mono">{m.toolName}</span>
              )}
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            {m.content ? (
              <p className="whitespace-pre-wrap">{m.content}</p>
            ) : (
              <p className="italic text-muted-foreground">
                Message body not stored (privacy mode).
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
