import Link from "next/link";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { ChatUI, type InitialMessage, type SampleableMember } from "./chat-ui";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channelId?: string; conversationId?: string; new?: string }>;
}) {
  const session = await requireSession();
  const { channelId, conversationId, new: isNew } = await searchParams;

  const channels = await prisma.channel.findMany({
    where: {
      organizationId: session.organizationId,
      type: "WEB",
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const active =
    (channelId && channels.find((c) => c.id === channelId)) || channels[0];

  if (!active) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No web channel is configured yet. An admin needs to{" "}
          <Link href="/channels/new" className="underline">
            create one
          </Link>
          .
        </p>
      </div>
    );
  }

  // Resume the caller's own most recent conversation on this channel (or the
  // explicitly requested one, validated to belong to them). Strictly scoped
  // by `membershipId` so one user can never see another user's history.
  // `?new=1` forces a fresh chat without deleting the previous one.
  let conversation: { id: string } | null = null;
  let initialMessages: InitialMessage[] = [];

  if (!isNew) {
    const found = conversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            channelId: active.id,
            membershipId: session.membershipId,
          },
          include: {
            messages: { orderBy: { createdAt: "asc" } },
          },
        })
      : await prisma.conversation.findFirst({
          where: {
            channelId: active.id,
            membershipId: session.membershipId,
          },
          orderBy: { updatedAt: "desc" },
          include: {
            messages: { orderBy: { createdAt: "asc" } },
          },
        });

    if (found) {
      conversation = { id: found.id };
      // Only USER and ASSISTANT turns get hydrated into the UI — the agent
      // loop already strips TOOL rows from history for the same reason.
      initialMessages = found.messages
        .filter((m) => (m.role === "USER" || m.role === "ASSISTANT") && m.content)
        .map((m) => ({
          role: m.role === "USER" ? "user" : "assistant",
          content: m.content as string,
        }));
    }
  }

  // Admins and owners can sample the assistant as any standard member (rank
  // below them). They cannot sample other admins or owners.
  let sampleable: SampleableMember[] = [];
  if (session.role === "OWNER" || session.role === "ADMIN") {
    const members = await prisma.orgMembership.findMany({
      where: {
        organizationId: session.organizationId,
        role: "MEMBER",
        status: { in: ["ACTIVE", "INVITED"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
    sampleable = members.map((m) => ({
      id: m.id,
      name: m.user.name || m.user.email,
      jobTitle: m.jobTitle,
    }));
  }

  return (
    <div className="-m-8 flex h-[calc(100vh-0px)] flex-col">
      <ChatUI
        channelId={active.id}
        channelName={active.name}
        initialConversationId={conversation?.id}
        initialMessages={initialMessages}
        sampleableMembers={sampleable}
      />
    </div>
  );
}
