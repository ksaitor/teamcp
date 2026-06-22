"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiSettings } from "react-icons/fi";
import type { ChannelType, ChannelStatus } from "@prisma/client";
import { CHANNEL_META } from "@/lib/channel-icons";

export interface ChannelRow {
  id: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  identities: number;
  conversations: number;
}

export function ChannelsTable({ channels }: { channels: ChannelRow[] }) {
  const router = useRouter();

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border text-muted-foreground">
        <tr>
          <th className="pb-2 font-medium">Type</th>
          <th className="pb-2 font-medium">Name</th>
          <th className="pb-2 font-medium">Status</th>
          <th className="pb-2 font-medium">Identities</th>
          <th className="pb-2 font-medium">Conversations</th>
          <th className="pb-2 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {channels.map((c) => {
          const meta = CHANNEL_META[c.type];
          const Icon = meta.icon;
          const href = `/channels/${c.id}`;
          return (
            <tr
              key={c.id}
              onClick={() => router.push(href)}
              className="cursor-pointer hover:bg-accent/40"
            >
              <td className="py-3">
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 font-medium hover:underline"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {meta.label}
                </Link>
              </td>
              <td className="py-3">
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {c.name}
                </Link>
              </td>
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
              <td className="py-3 text-muted-foreground">{c.identities}</td>
              <td className="py-3 text-muted-foreground">{c.conversations}</td>
              <td className="py-3">
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <FiSettings className="h-4 w-4" />
                  Configure
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
