import type { Metadata } from "next";
import Link from "next/link";
import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { CollectibleTitlePill } from "@/components/profile/CollectibleTitlePill";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getCollectibleIdentitiesByProfileIds } from "@/lib/collectibles/identity";
import { POINT_VALUES, getLeaderboardSnapshot, type LeaderboardEntry } from "@/lib/points/pointEvents";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard | Poopin",
  description: "See the top Poopin contributors and how reviews, photos, and restroom adds stack up across the app."
};

const LEADERBOARD_LIMIT = 50;
const LEADERBOARD_RETURN_TO = "/leaderboard";

const TOP_RANK_LABELS = {
  1: "Bathroom Royalty",
  2: "Stall Scholar",
  3: "Porcelain Pioneer"
} as const;

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

const getInitials = (displayName: string) => {
  const cleaned = displayName.trim();
  if (!cleaned) {
    return "PP";
  }

  const parts = cleaned.split(/\s+/).slice(0, 2);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part[0]).join("").toUpperCase();
};

const getAvatarTone = (rank: number) => {
  if (rank === 1) {
    return "from-amber-300 via-orange-200 to-rose-200 text-slate-900";
  }

  if (rank === 2) {
    return "from-slate-200 via-slate-100 to-blue-100 text-slate-900";
  }

  if (rank === 3) {
    return "from-orange-200 via-amber-100 to-yellow-100 text-slate-900";
  }

  return "from-slate-900 via-slate-800 to-slate-700 text-white";
};

const getTopGridClass = (count: number) => {
  if (count <= 1) {
    return "grid-cols-1";
  }

  if (count === 2) {
    return "grid-cols-1 md:grid-cols-2";
  }

  return "grid-cols-1 lg:grid-cols-3";
};

function RankAvatar({ displayName, rank }: { displayName: string; rank: number }) {
  return (
    <div
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarTone(rank)} text-sm font-semibold shadow-sm`}
    >
      {getInitials(displayName)}
    </div>
  );
}

function StatPill({
  label,
  count,
  tone
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone}`}>
      <span>{label}</span>
      <span>{count}</span>
    </span>
  );
}

function ScoreLegendPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
      {label}
    </span>
  );
}

type LeaderboardDisplayEntry = LeaderboardEntry & {
  collectibleTitle?: string | null;
  collectibleRarity?: string | null;
};

const getLeaderboardProfileHref = (profileId: string) =>
  `/u/${profileId}?returnTo=${encodeURIComponent(LEADERBOARD_RETURN_TO)}`;

function TopContributorCard({ entry }: { entry: LeaderboardDisplayEntry }) {
  const topLabel = TOP_RANK_LABELS[entry.rank as 1 | 2 | 3] ?? "Top contributor";
  const cardTone =
    entry.rank === 1
      ? "border-amber-200/80 bg-[radial-gradient(circle_at_top,#fff7db_0%,#ffffff_52%,#ffffff_100%)] shadow-[0_20px_52px_rgba(217,119,6,0.14)]"
      : "border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_14px_32px_rgba(15,23,42,0.08)]";

  return (
    <article className={`rounded-[28px] border p-4 sm:p-5 ${cardTone}`}>
      <div className="flex items-start gap-3">
        <RankAvatar displayName={entry.displayName} rank={entry.rank} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                #{entry.rank} {topLabel}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Link href={getLeaderboardProfileHref(entry.profileId)} className="break-words text-xl font-semibold tracking-tight text-slate-900 transition hover:text-brand-700">
                  {entry.displayName}
                </Link>
                {entry.collectibleTitle && entry.collectibleRarity ? (
                  <CollectibleTitlePill title={entry.collectibleTitle} rarity={entry.collectibleRarity} />
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Points</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{formatNumber(entry.totalPoints)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatPill label="Reviews" count={entry.reviewCount} tone="bg-brand-50 text-brand-700 ring-brand-100" />
            <StatPill label="Photos" count={entry.photoCount} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
            <StatPill label="Adds" count={entry.restroomAddCount} tone="bg-amber-50 text-amber-700 ring-amber-100" />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>{formatNumber(entry.contributionCount)} counted contributions</span>
            <span>Rank #{entry.rank}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function LeaderboardRow({ entry, isCurrentViewer = false }: { entry: LeaderboardDisplayEntry; isCurrentViewer?: boolean }) {
  return (
    <article
      className={`rounded-[24px] border px-4 py-3.5 transition sm:px-5 ${
        isCurrentViewer
          ? "border-brand-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] shadow-[0_16px_36px_rgba(37,99,235,0.09)]"
          : "border-slate-200/90 bg-white shadow-sm"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="flex items-center gap-3">
          <div className="inline-flex min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            #{entry.rank}
          </div>
          <RankAvatar displayName={entry.displayName} rank={entry.rank} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={getLeaderboardProfileHref(entry.profileId)} className="break-words text-base font-semibold tracking-tight text-slate-900 transition hover:text-brand-700 sm:text-lg">
              {entry.displayName}
            </Link>
            {entry.collectibleTitle && entry.collectibleRarity ? (
              <CollectibleTitlePill title={entry.collectibleTitle} rarity={entry.collectibleRarity} />
            ) : null}
            {isCurrentViewer ? (
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                You
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatPill label="Reviews" count={entry.reviewCount} tone="bg-slate-50 text-slate-700 ring-slate-200" />
            <StatPill label="Photos" count={entry.photoCount} tone="bg-slate-50 text-slate-700 ring-slate-200" />
            <StatPill label="Adds" count={entry.restroomAddCount} tone="bg-slate-50 text-slate-700 ring-slate-200" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {formatNumber(entry.contributionCount)} total
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900">
            {formatNumber(entry.totalPoints)} pts
          </span>
        </div>
      </div>
    </article>
  );
}

function LeaderboardEmptyState() {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Leaderboard</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">No contributors on the board yet</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
        The first review, photo, or restroom add will put someone on the board. That first name sets the tone for everyone after it.
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Explore restrooms
        </Link>
        <Link
          href="/add"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Add a restroom
        </Link>
      </div>
    </section>
  );
}

function CurrentViewerStandingCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <section className="rounded-[28px] border border-brand-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-5 shadow-[0_16px_36px_rgba(37,99,235,0.10)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Your standing</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            You’re currently #{entry.rank}.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {formatNumber(entry.totalPoints)} points from {entry.reviewCount} reviews, {entry.photoCount} photos, and{" "}
            {entry.restroomAddCount} restroom adds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatPill label="Reviews" count={entry.reviewCount} tone="bg-brand-50 text-brand-700 ring-brand-100" />
          <StatPill label="Photos" count={entry.photoCount} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
          <StatPill label="Adds" count={entry.restroomAddCount} tone="bg-amber-50 text-amber-700 ring-amber-100" />
        </div>
      </div>
    </section>
  );
}

export default async function LeaderboardPage() {
  const authContext = await getAuthenticatedProfile();
  const currentProfileId = authContext?.profile?.id ?? null;

  let leaderboardError: string | null = null;
  let entries: LeaderboardEntry[] = [];
  let currentViewerEntry: LeaderboardEntry | null = null;
  let totalContributors = 0;

  try {
    const snapshot = await getLeaderboardSnapshot(currentProfileId, LEADERBOARD_LIMIT);
    entries = snapshot.entries;
    currentViewerEntry = snapshot.currentViewerEntry;
    totalContributors = snapshot.totalContributors;
  } catch (error) {
    console.error("[Poopin] Could not load leaderboard.", error);
    leaderboardError = "The leaderboard is taking a quick breather right now. Please try again in a moment.";
  }

  const collectibleIdentities = entries.length > 0 ? await getCollectibleIdentitiesByProfileIds(entries.map((entry) => entry.profileId)) : new Map();
  const toDisplayEntry = (entry: LeaderboardEntry): LeaderboardDisplayEntry => {
    const identity = collectibleIdentities.get(entry.profileId);
    return {
      ...entry,
      collectibleTitle: identity?.activeCardTitle ?? null,
      collectibleRarity: identity?.activeCardRarity ?? null
    };
  };

  const displayEntries = entries.map(toDisplayEntry);
  const displayCurrentViewerEntry = currentViewerEntry ? toDisplayEntry(currentViewerEntry) : null;

  const topThree = displayEntries.slice(0, Math.min(3, displayEntries.length));
  const remainingEntries = displayEntries.slice(topThree.length);
  const showCurrentViewerCard = Boolean(displayCurrentViewerEntry && displayCurrentViewerEntry.rank > LEADERBOARD_LIMIT);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <MobileBackButton fallbackHref="/" className="mb-4" />

      <section className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Community leaderboard</p>
            <h1 className="mt-1 text-[2rem] font-semibold tracking-tight text-slate-900 sm:text-[2.35rem]">
              Top Poopin contributors
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ranked from real reviews, photo uploads, and restroom adds. Tight, public, and capped to the top 50.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ScoreLegendPill label={`+${POINT_VALUES.review} per review`} />
            <ScoreLegendPill label={`+${POINT_VALUES.photo} per photo`} />
            <ScoreLegendPill label={`+${POINT_VALUES.restroom} per restroom`} />
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
              Top {LEADERBOARD_LIMIT}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
              {formatNumber(totalContributors)} ranked users
            </span>
          </div>
        </div>
      </section>

      {leaderboardError ? (
        <section className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm sm:p-5">
          {leaderboardError}
        </section>
      ) : null}

      {!leaderboardError && entries.length === 0 ? (
        <div className="mt-5">
          <LeaderboardEmptyState />
        </div>
      ) : null}

      {!leaderboardError && topThree.length > 0 ? (
        <section className={`mt-5 grid gap-3 ${getTopGridClass(topThree.length)}`}>
          {topThree.map((entry) => (
            <TopContributorCard key={entry.profileId} entry={entry} />
          ))}
        </section>
      ) : null}

      {showCurrentViewerCard && displayCurrentViewerEntry ? (
        <div className="mt-5">
          <CurrentViewerStandingCard entry={displayCurrentViewerEntry} />
        </div>
      ) : null}

      {!leaderboardError && remainingEntries.length > 0 ? (
        <section className="mt-5 rounded-[28px] border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Rankings</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                Ranks {topThree.length + 1}-{Math.min(entries.length, LEADERBOARD_LIMIT)}
              </h2>
            </div>
            <p className="text-sm text-slate-500">Scoring stays simple: +{POINT_VALUES.review} per review, +{POINT_VALUES.photo} per photo, +{POINT_VALUES.restroom} per restroom.</p>
          </div>

          <div className="mt-4 space-y-2.5">
            {remainingEntries.map((entry) => (
              <LeaderboardRow
                key={entry.profileId}
                entry={entry}
                isCurrentViewer={Boolean(currentViewerEntry && currentViewerEntry.profileId === entry.profileId)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
