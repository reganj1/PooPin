import { cn } from "@/lib/utils/cn";

interface CollectibleTitlePillProps {
  title: string;
  rarity: string;
  className?: string;
}

const rarityToneClassNames: Record<string, string> = {
  Common: "border-slate-200 bg-slate-50 text-slate-700",
  Uncommon: "border-sky-200 bg-sky-50 text-sky-700",
  Rare: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Epic: "border-amber-200 bg-amber-50 text-amber-700",
  Legendary: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  Mythic: "border-violet-200 bg-violet-50 text-violet-700"
};

export function CollectibleTitlePill({ title, rarity, className }: CollectibleTitlePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        rarityToneClassNames[rarity] ?? rarityToneClassNames.Common,
        className
      )}
    >
      {title}
    </span>
  );
}
