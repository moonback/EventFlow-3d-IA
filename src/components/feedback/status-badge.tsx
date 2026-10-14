import type { Tone } from "@/lib/labels";
import { Badge } from "../ui/badge";

export function StatusBadge<T extends string>({ value, labels, tones }: { value: T; labels: Record<T, string>; tones?: Partial<Record<T, Tone>> }) {
  return <Badge tone={tones?.[value] ?? "neutral"}>{labels[value] ?? value}</Badge>;
}
