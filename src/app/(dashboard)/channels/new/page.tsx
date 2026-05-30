import { requireAdmin } from "@/lib/auth";
import { NewChannelForm } from "./new-channel-form";

export default async function NewChannelPage() {
  await requireAdmin();
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Add channel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick where your team will chat. The web channel works inside this app
        with no setup. Bot channels need credentials from the bot platform.
      </p>

      <NewChannelForm />
    </div>
  );
}
