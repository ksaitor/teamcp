import type { IconType } from "react-icons";
import { cn } from "@/lib/utils";

/**
 * Renders a provider's brand mark. Downloaded SVGs (currentColor, served from
 * /public) are drawn via a CSS mask so they follow the foreground token in both
 * light and dark mode, matching inline react-icons marks. Falls back to a
 * react-icons component when no logo file is set.
 */
export function ProviderGlyph({
  logo,
  icon: Icon,
  className,
}: {
  logo?: string;
  icon?: IconType;
  className?: string;
}) {
  if (logo) {
    return (
      <span
        aria-hidden
        className={cn("inline-block bg-current", className)}
        style={{
          maskImage: `url(${logo})`,
          WebkitMaskImage: `url(${logo})`,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskSize: "contain",
          WebkitMaskSize: "contain",
        }}
      />
    );
  }
  if (Icon) {
    return <Icon className={className} aria-hidden />;
  }
  return null;
}
