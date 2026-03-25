import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { CollectibleCard } from "@/components/profile/CollectibleCard";
import { CollectibleTitlePill } from "@/components/profile/CollectibleTitlePill";
import { sanitizeReturnTo } from "@/lib/auth/login";
import { getCollectibleCardByKey } from "@/lib/collectibles/cards";
import { getCollectibleIdentitiesByProfileIds } from "@/lib/collectibles/identity";
import { getReviewQuickTagDescriptor, normalizeReviewQuickTags } from "@/lib/utils/reviewSignals";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface PublicProfilePageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface PublicReviewRow {
  id: string;
  bathroom_id: string;
  overall_rating: number;
  review_text: string | null;
  quick_tags: string[] | null;
  created_at: string;
  bathrooms:
    | {
        name: string | null;
        city: string | null;
      }
    | {
        name: string | null;
        city: string | null;
      }[]
    | null;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const identity = (await getCollectibleIdentitiesByProfileIds([id])).get(id);

  if (!identity) {
    return {
      title: "Profile | Poopin"
    };
  }

  return {
    title: `${identity.displayName} | Poopin`,
    description: `${identity.displayName}'s public Poopin profile and showcased collectible card.`
  };
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

const getBathroomSummary = (bathrooms: PublicReviewRow["bathrooms"]) => {
  const value = Array.isArray(bathrooms) ? bathrooms[0] ?? null : bathrooms;
  if (!value) {
    return "Restroom listing";
  }

  if (value.city) {
    return `${value.name ?? "Restroom"} · ${value.city}`;
  }

  return value.name ?? "Restroom listing";
};

export default async function PublicProfilePage({ params, searchParams }: PublicProfilePageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawReturnTo = Array.isArray(resolvedSearchParams.returnTo) ? resolvedSearchParams.returnTo[0] : resolvedSearchParams.returnTo;
  const returnTo = rawReturnTo ? sanitizeReturnTo(rawReturnTo) : "/leaderboard";
  const identity = (await getCollectibleIdentitiesByProfileIds([id])).get(id);

  if (!identity) {
    notFound();
  }

  const supabase = getSupabaseServerClient();
  const reviewsResponse = supabase
    ? await supabase
        .from("reviews")
        .select("id, bathroom_id, overall_rating, review_text, quick_tags, created_at, bathrooms(name, city)")
        .eq("profile_id", id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(4)
    : { data: null, error: null };

  const recentReviews = reviewsResponse.error ? [] : ((reviewsResponse.data ?? []) as PublicReviewRow[]);
  const activeCard = getCollectibleCardByKey(identity.activeCardResolvedKey);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <MobileBackButton fallbackHref={returnTo} preferredHref={returnTo} className="mb-4" />

      <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 md:flex">
        <Link href={returnTo} className="text-sm font-medium text-brand-600 transition hover:text-brand-700">
          ← Back
        </Link>
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          Public profile
        </span>
      </div>

      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(20rem,0.98fr)] xl:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Contributor profile</p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.8rem]">{identity.displayName}</h1>
              <CollectibleTitlePill title={identity.activeCardTitle} rarity={identity.activeCardRarity} />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Community contributor with a current collectible score of <span className="font-semibold text-slate-900">{identity.contributionScore}</span>.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Contribution score</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{identity.contributionScore}</p>
                <p className="mt-1 text-xs text-slate-500">{identity.activeCardTitle}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Contribution mix</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Reviews {identity.counts.reviewCount}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Photos {identity.counts.photoCount}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Restrooms {identity.counts.restroomAddCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {activeCard ? (
            <CollectibleCard
              card={activeCard}
              isActive
              footer={
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Showcased collectible</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{activeCard.rarity}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current tier</p>
                    <span className="mt-1 inline-flex rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/80">
                    Tier {activeCard.tier}
                    </span>
                  </div>
                </div>
              }
            />
          ) : null}
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Recent reviews</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Latest restroom notes</h2>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {recentReviews.length} shown
          </span>
        </div>

        {recentReviews.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {recentReviews.map((review) => {
              const quickTags = normalizeReviewQuickTags(review.quick_tags ?? []).slice(0, 2);
              return (
                <Link
                  key={review.id}
                  href={`/restroom/${review.bathroom_id}#review-${review.id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                      Overall {review.overall_rating.toFixed(1)}
                    </span>
                    <span>{formatDate(review.created_at)}</span>
                    <span>{getBathroomSummary(review.bathrooms)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {review.review_text?.trim() || "Shared a quick rating update."}
                  </p>
                  {quickTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickTags.map((tag) => {
                        const descriptor = getReviewQuickTagDescriptor(tag);
                        if (!descriptor) {
                          return null;
                        }

                        return (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            {descriptor.icon} {descriptor.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-600">No public reviews to show yet.</p>
        )}
      </section>
    </main>
  );
}
