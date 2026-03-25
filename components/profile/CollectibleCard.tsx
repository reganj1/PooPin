"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { CollectibleCardDefinition } from "@/lib/collectibles/cards";
import { cn } from "@/lib/utils/cn";

interface CollectibleCardProps {
  card: CollectibleCardDefinition;
  className?: string;
  compact?: boolean;
  isActive?: boolean;
  isLocked?: boolean;
  footer?: ReactNode;
}

export function CollectibleCard({ card, className, compact = false, isActive = false, isLocked = false, footer }: CollectibleCardProps) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-4 shadow-sm",
        card.theme.shell,
        card.theme.border,
        compact ? "min-h-[248px]" : "min-h-[300px] sm:min-h-[320px] sm:p-5",
        isActive && "ring-2 ring-slate-900/10",
        isLocked && "saturate-75",
        className
      )}
    >
      <div className={cn("pointer-events-none absolute -right-10 top-10 h-28 w-28 rounded-full blur-2xl", card.theme.glow)} />
      <div className={cn("pointer-events-none absolute -left-8 bottom-6 h-24 w-24 rounded-full blur-2xl", card.theme.glow)} />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Collectible card</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Tier {card.tier}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", card.theme.badge)}>
              {card.rarity}
            </span>
            {isActive ? (
              <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                Active
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "relative mt-5 overflow-hidden rounded-[24px] border border-white/70 bg-white/65 shadow-sm",
            compact ? "aspect-[1.18/1] w-full max-w-[13.5rem]" : "aspect-[1.16/1] w-full max-w-[16rem]"
          )}
        >
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", card.theme.orb)} />
          <Image
            src={card.imageSrc}
            alt={`${card.title} collectible artwork`}
            fill
            sizes={compact ? "160px" : "(max-width: 640px) 220px, 280px"}
            className="object-cover"
          />
          <div className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/85 text-lg shadow-sm ring-1 ring-white/80">
            <span aria-hidden="true">{card.mascot}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className={cn("text-xl font-semibold tracking-tight text-slate-950", compact ? "text-lg" : "sm:text-2xl")}>{card.title}</h3>
            <span className="text-sm text-slate-500">{card.sparkle}</span>
          </div>
          <p className={cn("mt-2 max-w-xs text-sm leading-6 text-slate-700", compact && "text-[13px] leading-5")}>{card.flavorLine}</p>
        </div>

        <div className="mt-auto pt-4">
          {footer ?? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-500">Unlocks at {card.threshold}</span>
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", card.theme.accent)}>
                {isLocked ? "Locked" : "Unlocked"}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
