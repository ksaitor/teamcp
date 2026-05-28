import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { connectorCatalog } from "@/lib/connectors-catalog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function NewConnectorPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/connectors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to connectors
      </Link>

      <h1 className="mt-3 text-2xl font-bold">Add a connector</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a data source to connect to your organization.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connectorCatalog.map((entry) => {
          const Icon = entry.icon;
          const card = (
            <Card
              className={cn(
                "h-full transition-colors",
                entry.available
                  ? "cursor-pointer hover:border-ring hover:bg-muted/50"
                  : "pointer-events-none opacity-60"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                    <Icon className="size-5" />
                  </div>
                  {!entry.available && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </div>
                <CardTitle className="mt-3">{entry.label}</CardTitle>
                <CardDescription>{entry.description}</CardDescription>
              </CardHeader>
            </Card>
          );

          if (!entry.available) {
            return <div key={entry.slug}>{card}</div>;
          }

          return (
            <Link key={entry.slug} href={`/connectors/new/${entry.slug}`}>
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
