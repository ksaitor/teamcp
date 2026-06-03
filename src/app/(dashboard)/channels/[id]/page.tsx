import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { TELEGRAM_DELIVERY_MODE } from "@/channels/telegram";
import { ChannelDetail } from "./channel-detail";

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;

  const channel = await prisma.channel.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      identities: {
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { linkedAt: "desc" },
      },
    },
  });

  if (!channel) notFound();

  const conversations = await prisma.conversation.findMany({
    where: { channelId: channel.id },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: {
      membership: {
        include: { user: { select: { name: true, email: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  // Webhook URL — best effort. We don't know the public origin server-side, so
  // we render a placeholder and let the client compute it on mount.
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{channel.name}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {channel.type}
        </span>
        <Link
          href="/channels"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </div>

      <ChannelDetail
        channel={{
          id: channel.id,
          name: channel.name,
          type: channel.type,
          status: channel.status,
          modelOverride: channel.modelOverride,
          defaultLlmProviderId: channel.defaultLlmProviderId,
          webhookSecret: channel.webhookSecret,
          hasCredentials: !!channel.credentialsEncrypted,
        }}
        deliveryMode={channel.type === "TELEGRAM" ? TELEGRAM_DELIVERY_MODE : null}
        identities={channel.identities.map((i) => ({
          id: i.id,
          externalId: i.externalId,
          displayName: i.displayName,
          memberEmail: i.membership.user.email,
          memberName: i.membership.user.name,
          linkedAt: i.linkedAt.toISOString(),
        }))}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          memberEmail: c.membership.user.email,
          updatedAt: c.updatedAt.toISOString(),
          messageCount: c._count.messages,
        }))}
      />
    </div>
  );
}
