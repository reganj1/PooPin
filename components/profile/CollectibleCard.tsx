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
        compact ? "min-h-[272px]" : "min-h-[400px] sm:min-h-[476px]",
        isActive && "ring-2 ring-slate-900/10",
        isLocked && "saturate-75",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-[1px] rounded-[27px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),inset_0_-1px_0_rgba(15,23,42,0.06)]" />
      <div className={cn("pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full blur-3xl", card.theme.glow, compact ? "opacity-35" : "opacity-50")} />

      <div className="relative flex h-full flex-col">
        <div className={cn("flex items-center justify-between gap-3", compact ? "px-4 pt-4 pb-3" : "px-5 pt-5 pb-3.5 sm:px-6 sm:pt-6 sm:pb-4")}>
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm", card.theme.badge)}>
            {card.rarity}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tier {card.tier}</span>
            {isActive ? (
              <span className="inline-flex rounded-full bg-slate-950/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                Active
              </span>
            ) : null}
          </div>
        </div>

        <div className={cn("relative w-full overflow-hidden", compact ? "h-[150px]" : "h-[226px] sm:h-[282px]")}>
          <div className={cn("absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,var(--tw-gradient-stops))]", card.theme.orb, compact ? "opacity-70" : "opacity-82")} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.04)_24%,rgba(15,23,42,0.14)_100%)]" />
          <Image
            src={card.imageSrc}
            alt={`${card.title} collectible artwork`}
            fill
            sizes={compact ? "(max-width: 640px) 320px, 360px" : "(max-width: 640px) 420px, 540px"}
            className={cn(
              "object-cover object-center drop-shadow-[0_20px_30px_rgba(15,23,42,0.16)]",
              compact ? "scale-[1.14]" : "scale-[1.1]"
            )}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/22 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/20 to-transparent" />
        </div>

        <div className={cn("relative border-t border-slate-900/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.88))] text-white", compact ? "px-4 py-3.5" : "px-5 py-4 sm:px-6 sm:py-5")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <h3 className={cn("min-w-0 font-semibold tracking-tight text-white", compact ? "text-lg" : "text-[1.85rem] sm:text-[2rem]")}>{card.title}</h3>
                <span className={cn("shrink-0 text-white/70", compact ? "pt-1 text-xs" : "pt-1 text-sm")}>{card.sparkle}</span>
              </div>
              <p className={cn("mt-2 max-w-xl text-white/82", compact ? "text-[13px] leading-5" : "text-sm leading-6")}>{card.flavorLine}</p>
            </div>
            <div className={cn("inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/18 backdrop-blur-sm", compact ? "h-9 w-9 text-base" : "h-11 w-11 text-lg")}>
              <span aria-hidden="true">{card.mascot}</span>
            </div>
          </div>

          <div className={cn("mt-3 border-t border-white/12 text-white/88", compact ? "pt-2.5" : "mt-4 pt-3")}>
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
      </div>
    </article>
  );
}
