"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CollectibleProgressSummary } from "@/lib/collectibles/progress";
import { CollectibleCard } from "@/components/profile/CollectibleCard";

interface UpdateActiveCardResponse {
  success?: boolean;
  activeCardKey?: string;
  error?: string;
}

interface ProfileCollectiblesPanelProps {
  progress: CollectibleProgressSummary;
  profileId: string;
  displayName: string;
}

const copyText = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available in this browser.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const didCopy = document.execCommand("copy");
    if (!didCopy) {
      throw new Error("Clipboard copy command was rejected.");
    }
  } finally {
    document.body.removeChild(textArea);
  }
};

export function ProfileCollectiblesPanel({ progress, profileId, displayName }: ProfileCollectiblesPanelProps) {
  const router = useRouter();
  const [activeCardKey, setActiveCardKey] = useState(progress.activeCardKey);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const activeCard = useMemo(
    () => progress.unlockedCards.find((card) => card.key === activeCardKey) ?? progress.activeCard,
    [activeCardKey, progress.activeCard, progress.unlockedCards]
  );
  const unlockedCards = useMemo(
    () => [...progress.unlockedCards].sort((left, right) => right.threshold - left.threshold),
    [progress.unlockedCards]
  );

  const handleSetActiveCard = async (cardKey: string) => {
    if (cardKey === activeCardKey) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile/active-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ activeCardKey: cardKey })
      });

      const payload = (await response.json()) as UpdateActiveCardResponse;
      if (!response.ok || !payload.activeCardKey) {
        setErrorMessage(payload.error ?? "Could not update your showcased card right now.");
        return;
      }

      setActiveCardKey(payload.activeCardKey);
      setStatusMessage("Showcased card updated.");
      router.refresh();
    } catch {
      setErrorMessage("Could not update your showcased card right now.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSharing(true);

    try {
      const publicProfileUrl = `${window.location.origin}/u/${profileId}`;
      const shareText = `${displayName} is showing off the ${activeCard.title} collectible card on Poopin.`;

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `${activeCard.title} on Poopin`,
          text: shareText,
          url: publicProfileUrl
        });
        return;
      }

      await copyText(`${shareText}\n${publicProfileUrl}`);
      setStatusMessage("Public card link copied. Pair it with a screenshot of your card.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setErrorMessage("Could not start sharing right now.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Collectibles</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">Your showcase card</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Unlocks use contribution progress: reviews and photos count for one, restroom adds count for three. Separate from leaderboard points.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Unlock progress {progress.contributionScore}
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Tier {progress.currentTierCard.tier}
          </span>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSharing ? "Preparing..." : "Share card"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(18rem,0.82fr)]">
        <CollectibleCard
          card={activeCard}
          isActive
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Showcased on profile</p>
                <p className="mt-1 text-sm font-semibold text-white">{displayName}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Unlock progress</p>
                <p className="mt-1 text-lg font-semibold text-white">{progress.contributionScore}</p>
              </div>
            </div>
          }
        />

        <div className="space-y-4">
          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next unlock</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {progress.nextCard ? progress.nextCard.title : "Every launch card unlocked"}
                </p>
              </div>
              {progress.nextCard ? (
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {progress.remainingToNext} to go
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Complete set
                </span>
              )}
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-slate-900 transition-[width]"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-600">
              {progress.nextCard
                ? `${progress.remainingToNext} more progress point${progress.remainingToNext === 1 ? "" : "s"} to unlock ${progress.nextCard.title}.`
                : "You’ve unlocked every MVP collectible card. More variants can land later without resetting your progress."}
            </p>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Progress breakdown</p>
                <p className="mt-1 text-sm text-slate-600">What counts toward unlock progress.</p>
              </div>
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {progress.contributionScore} progress
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reviews</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{progress.counts.reviewCount}</p>
                <p className="mt-1 text-[11px] text-slate-500">+1 each</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Photos</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{progress.counts.photoCount}</p>
                <p className="mt-1 text-[11px] text-slate-500">+1 each</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Restrooms</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{progress.counts.restroomAddCount}</p>
                <p className="mt-1 text-[11px] text-slate-500">+3 each</p>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
          ) : null}
          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Unlocked cards</p>
            <p className="mt-1 text-sm text-slate-600">Choose what appears on your public profile.</p>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {progress.unlockedCards.length} unlocked
          </span>
        </div>

        <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
          {unlockedCards.map((card) => {
            const isCurrent = card.key === activeCardKey;

            return (
              <div key={card.key} className="min-w-[17rem] snap-start space-y-2 sm:min-w-0">
                <CollectibleCard
                  card={card}
                  compact
                  isActive={isCurrent}
                  footer={
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white/75">Unlocked at {card.threshold}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCurrent ? "bg-white text-slate-900" : "bg-white/18 text-white ring-1 ring-white/25 backdrop-blur-sm"}`}>
                        {isCurrent ? "Active" : card.rarity}
                      </span>
                    </div>
                  }
                />
                <button
                  type="button"
                  disabled={isCurrent || isSaving}
                  onClick={() => handleSetActiveCard(card.key)}
                  className={`inline-flex min-h-10 w-full items-center justify-center rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isCurrent
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isCurrent ? "Currently showcased" : isSaving ? "Saving..." : "Showcase this card"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
