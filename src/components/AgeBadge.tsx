import { Badge } from "@/components/ui/badge";
import type { AgeGuide } from "@/types/age";

/**
 * Compact age badge shown on recommendation cards, anime detail, Tonight
 * recommendations, and search results. Deliberately quiet — age info should
 * be visible without making the UI noisy.
 */
export function AgeBadge({ guide }: { guide?: AgeGuide }) {
  if (!guide) return null;

  const title = guide.sourceLabel
    ? `Age guide: ${guide.label} — ${guide.sourceLabel}`
    : `Age guide: ${guide.label}`;

  return (
    <Badge
      variant={guide.minimumAge !== undefined && guide.minimumAge >= 18 ? "destructive" : "secondary"}
      title={title}
      className="px-1.5 py-0 text-[10px] font-medium tracking-wide"
    >
      {guide.label}
    </Badge>
  );
}
