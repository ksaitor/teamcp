"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { llmProviderCatalog } from "@/lib/llm-providers-catalog";
import { ProviderGlyph } from "@/components/provider-glyph";
import { SearchInput } from "@/components/ui/search-input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export function ProviderGallery() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return llmProviderCatalog;
    return llmProviderCatalog.filter(
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
        placeholder="Search providers…"
        className="max-w-sm"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((entry) => (
          <Link key={entry.slug} href={`/models/new/${entry.slug}`}>
            <Card className="h-full cursor-pointer transition-colors hover:border-ring hover:bg-muted/50">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                  <ProviderGlyph
                    logo={entry.logo}
                    icon={entry.icon}
                    className="size-5"
                  />
                </div>
                <CardTitle className="mt-3">{entry.label}</CardTitle>
                <CardDescription>{entry.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {results.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No providers match “{query}”.
        </p>
      )}
    </div>
  );
}
