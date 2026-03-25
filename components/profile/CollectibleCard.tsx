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
        "relative isolate overflow-hidden rounded-[28px] border bg-gradient-to-br shadow-[0_18px_44px_rgba(15,23,42,0.18)]",
        card.theme.shell,
        card.theme.border,
        compact ? "min-h-[260px]" : "min-h-[360px] sm:min-h-[440px]",
        isActive && "ring-2 ring-slate-900/10",
        isLocked && "saturate-75",
        className
      )}
    >
      <Image
        src={card.imageSrc}
        alt={`${card.title} collectible artwork`}
        fill
        sizes={compact ? "(max-width: 640px) 320px, 360px" : "(max-width: 640px) 420px, 540px"}
        className="object-cover object-center"
      />
      <div className={cn("pointer-events-none absolute inset-0 opacity-45", card.theme.orb)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.12)_0%,rgba(15,23,42,0.04)_22%,rgba(15,23,42,0.18)_46%,rgba(15,23,42,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.20),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_26%)]" />

      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Collectible card</p>
            <p className="mt-1 text-xs font-medium text-white/75">Tier {card.tier}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm", card.theme.badge)}>
              {card.rarity}
            </span>
            {isActive ? (
              <span className="inline-flex rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                Active
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="max-w-[26rem] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex items-center gap-2">
              <h3 className={cn("text-xl font-semibold tracking-tight text-white", compact ? "text-lg" : "sm:text-[2rem]")}>{card.title}</h3>
              <span className="text-sm text-white/80">{card.sparkle}</span>
            </div>
            <p className={cn("mt-2 max-w-xl text-sm leading-6 text-white/85", compact && "text-[13px] leading-5")}>{card.flavorLine}</p>

            <div className="mt-4 border-t border-white/15 pt-3 text-white/85">
              {footer ?? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-white/75">Unlocks at {card.threshold}</span>
                  <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", card.theme.accent)}>
                    {isLocked ? "Locked" : "Unlocked"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/88 text-lg shadow-sm ring-1 ring-white/60 backdrop-blur-sm">
            <span aria-hidden="true">{card.mascot}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
