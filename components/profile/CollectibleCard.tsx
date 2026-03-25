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
        compact ? "min-h-[230px]" : "min-h-[340px] sm:min-h-[420px]",
        isActive && "ring-2 ring-slate-900/10",
        isLocked && "saturate-75",
        className
      )}
    >
      <div className={cn("pointer-events-none absolute -left-8 top-[-10%] h-40 w-40 rounded-full blur-3xl", card.theme.glow, compact ? "opacity-45" : "opacity-60")} />
      <div className={cn("pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,var(--tw-gradient-stops))]", card.theme.orb, compact ? "opacity-60" : "opacity-75")} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.96)_0%,rgba(248,250,252,0.88)_34%,rgba(248,250,252,0.52)_58%,rgba(248,250,252,0.14)_76%,rgba(248,250,252,0.02)_100%)]" />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0",
          compact ? "w-[68%]" : "w-[64%] sm:w-[60%]"
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-[-8%]",
            compact ? "left-[16%] top-[6%] bottom-[10%]" : "left-[6%] top-[4%] bottom-[6%]"
          )}
        >
          <Image
            src={card.imageSrc}
            alt={`${card.title} collectible artwork`}
            fill
            sizes={compact ? "(max-width: 640px) 320px, 360px" : "(max-width: 640px) 420px, 540px"}
            className={cn(
              "object-contain object-right drop-shadow-[0_18px_32px_rgba(15,23,42,0.16)]",
              compact ? "scale-[0.98] opacity-[0.9]" : "scale-[1.04] opacity-[0.96]"
            )}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,rgba(15,23,42,0)_0%,rgba(15,23,42,0.08)_28%,rgba(15,23,42,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_26%)]" />

      <div className={cn("relative flex h-full flex-col justify-between", compact ? "p-4" : "p-4 sm:p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className={cn("max-w-[13rem] sm:max-w-[16rem]", compact && "max-w-[11rem]")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm", card.theme.badge)}>
                {card.rarity}
              </span>
              {isActive ? (
                <span className="inline-flex rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                  Active
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Tier {card.tier} collectible</p>
            <div className="mt-2 flex items-center gap-2">
              <h3 className={cn("font-semibold tracking-tight text-slate-950", compact ? "text-lg" : "text-[1.95rem] sm:text-[2.15rem]")}>{card.title}</h3>
              <span className={cn("shrink-0 text-slate-500", compact ? "text-xs" : "text-sm")}>{card.sparkle}</span>
            </div>
            <p className={cn("mt-2 text-slate-700", compact ? "max-w-[11rem] text-[13px] leading-5" : "max-w-[18rem] text-sm leading-6")}>
              {card.flavorLine}
            </p>
          </div>
          <div className={cn("inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/80 text-slate-900 shadow-sm ring-1 ring-white/60 backdrop-blur-sm", compact ? "h-9 w-9 text-base" : "h-11 w-11 text-lg")}>
            <span aria-hidden="true">{card.mascot}</span>
          </div>
        </div>

        <div className="max-w-[26rem] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.18)]">
          <div className={cn("border-t border-white/18", compact ? "pt-2.5" : "pt-3")}>
            <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70", compact ? "hidden" : "block")}>Collectible details</p>
            <div className="text-white/88">
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
      </div>
    </article>
  );
}
