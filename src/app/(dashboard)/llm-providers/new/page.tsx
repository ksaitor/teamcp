import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import { requireAdmin } from "@/lib/auth";
import { ProviderGallery } from "./provider-gallery";

export default async function NewLlmProviderPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/llm-providers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <FiArrowLeft className="size-4" />
        Back to AI models
      </Link>

      <h1 className="mt-3 text-2xl font-bold">Add an AI model provider</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect an LLM provider your team can use. You can add several and pick a default.
      </p>

      <ProviderGallery />
    </div>
  );
}
