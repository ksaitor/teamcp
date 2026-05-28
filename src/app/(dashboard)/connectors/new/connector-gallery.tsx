"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { connectorCatalog } from "@/lib/connectors-catalog";
import { SearchInput } from "@/components/ui/search-input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ConnectorGallery() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connectorCatalog;
    return connectorCatalog.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="mt-6">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search data sources…"
        className="max-w-sm"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((entry) => {
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

      {results.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No data sources match “{query}”.
        </p>
      )}
    </div>
  );
}
