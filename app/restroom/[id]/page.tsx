import Link from "next/link";
import { notFound } from "next/navigation";
import { RestroomViewedTracker } from "@/components/analytics/RestroomViewedTracker";
import { AuthRequiredContributionCard } from "@/components/auth/AuthRequiredContributionCard";
import { TrackedNavigateLink } from "@/components/analytics/TrackedNavigateLink";
import { RatingPills } from "@/components/restroom/RatingPills";
import { RestroomTags } from "@/components/restroom/RestroomTags";
import { PhotoUploadForm } from "@/components/restroom/PhotoUploadForm";
import { RestroomPhotoGallery } from "@/components/restroom/RestroomPhotoGallery";
import { ReportIssueForm } from "@/components/restroom/ReportIssueForm";
import { RestroomConfirmationCard } from "@/components/restroom/RestroomConfirmationCard";
import { ReviewList } from "@/components/review/ReviewList";
import { ReviewForm } from "@/components/review/ReviewForm";
import { ReviewSummary } from "@/components/review/ReviewSummary";
import { isAuthConfigured } from "@/lib/auth/config";
import { buildContributionLoginHref, getContributionIntent } from "@/lib/auth/login";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserDisplayName } from "@/lib/auth/sessionUser";
import { getBathroomConfirmationCountData } from "@/lib/data/confirmations";
import { getApprovedBathroomPhotosData } from "@/lib/data/photos";
import { getBathroomByIdData, getBathroomReviewsData } from "@/lib/data/restrooms";
import { getRestroomDetailLocationLine, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";

interface RestroomDetailPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

function NavigateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path
        d="M18 2 9.5 10.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M18 2 12.7 17.1l-3-6.8L3 7.3z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <path
        d="M5.5 3.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M7 7h6M7 10h6M7 13h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export default async function RestroomDetailPage({ params, searchParams }: RestroomDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const restroom = await getBathroomByIdData(id);
  if (!restroom) {
    notFound();
  }

  const authContext = await getAuthenticatedProfile();
  const authUser = authContext?.authUser ?? null;
  const viewerProfile = authContext?.profile ?? null;

  const viewerDisplayName = viewerProfile?.display_name ?? getSessionUserDisplayName(authUser) ?? "your Poopin profile";
  const contributionIntent = getContributionIntent(resolvedSearchParams.intent);
  const reviewLoginHref = buildContributionLoginHref(`/restroom/${restroom.id}`, "review", "add-review");
  const photoLoginHref = buildContributionLoginHref(`/restroom/${restroom.id}`, "photo", "photos");
  const reviews = await getBathroomReviewsData(restroom.id, viewerProfile?.id ?? null);
  const displayName = getRestroomDisplayName(restroom);
  const locationLine = getRestroomDetailLocationLine(restroom);
  const sourceLabel = getRestroomSourceLabel(restroom.source);
  const approvedPhotos = await getApprovedBathroomPhotosData(restroom.id);
  const confirmationCount = await getBathroomConfirmationCountData(restroom.id);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <RestroomViewedTracker bathroomId={restroom.id} />
      <div className="mb-5">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to nearby list
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-5">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Restroom listing</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{displayName}</h1>
            <p className="mt-2 text-sm text-slate-600">{locationLine}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {sourceLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                Added {formatDate(restroom.created_at)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Enable location on the map to see live straight-line distance.</p>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto lg:max-w-[18rem] lg:justify-start">
            <TrackedNavigateLink
              latitude={restroom.lat}
              longitude={restroom.lng}
              bathroomId={restroom.id}
              source="restroom_detail"
              sourceSurface="restroom_detail"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto sm:flex-none"
            >
              <NavigateIcon className="h-4 w-4" />
              Navigate
            </TrackedNavigateLink>
            {viewerProfile ? (
              <Link
                href="#add-review"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
              >
                <NoteIcon className="h-4 w-4" />
                Write a review
              </Link>
            ) : isAuthConfigured ? (
              <a
                href={reviewLoginHref}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
              >
                <NoteIcon className="h-4 w-4" />
                Write a review
              </a>
            ) : (
              <span
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400 sm:flex-none"
                aria-disabled="true"
              >
                <NoteIcon className="h-4 w-4" />
                Write a review
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <RatingPills ratings={restroom.ratings} />
          {restroom.ratings.qualitySignals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {restroom.ratings.qualitySignals.slice(0, 2).map((signal) => {
                const descriptor = getReviewQuickTagDescriptor(signal);
                if (!descriptor) {
                  return null;
                }

                return (
                  <span
                    key={signal}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${reviewQuickTagToneClassName[descriptor.tone]}`}
                  >
                    {descriptor.icon} {descriptor.label}
                  </span>
                );
              })}
            </div>
          ) : null}
          <RestroomTags restroom={restroom} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <RestroomConfirmationCard bathroomId={restroom.id} initialCount={confirmationCount} />
          <section className="flex h-full min-h-[172px] flex-col rounded-[26px] border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm sm:p-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Listing quality</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Help us keep this listing accurate.</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                Notice a wrong pin, outdated access details, or anything else off? Send a quick report and we will review it.
              </p>
            </div>
            <div className="mt-auto pt-3">
              <ReportIssueForm bathroomId={restroom.id} />
            </div>
          </section>
        </div>
      </section>

      <section id="photos" className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
            <p className="mt-1 text-sm text-slate-500">Only approved photos appear publicly.</p>
          </div>
        </div>
        {viewerProfile ? (
          <div className="mb-3">
            <PhotoUploadForm
              bathroomId={restroom.id}
              defaultOpen={contributionIntent === "photo"}
              viewerDisplayName={viewerDisplayName}
            />
          </div>
        ) : authUser ? (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            We could not load your account right now. Please refresh and try uploading again.
          </div>
        ) : (
          <div className="mb-3">
            <AuthRequiredContributionCard
              title="Add a photo"
              description="Sign in to upload a photo. We’ll bring you right back here and keep the photo form open."
              loginHref={photoLoginHref}
              isAuthConfigured={isAuthConfigured}
              eyebrow="Add photo"
              ctaLabel="Sign in to upload photo"
              reassurance="Photo uploads stay tied to your account, but browsing this restroom stays public."
            />
          </div>
        )}
        <RestroomPhotoGallery photos={approvedPhotos} />
      </section>

      <section className="mt-5 space-y-5">
        {viewerProfile ? (
          <ReviewForm bathroomId={restroom.id} viewerDisplayName={viewerDisplayName} />
        ) : authUser ? (
          <section id="add-review" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            We could not load your account right now. Please refresh and try posting again.
          </section>
        ) : (
          <section
            id="add-review"
            className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4 shadow-sm sm:px-6"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Write review</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Sign in before you post.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Use the review button above to sign in, then we’ll bring you straight back here with the review form ready.
            </p>
          </section>
        )}
        {reviews.length > 0 ? <ReviewSummary reviews={reviews} /> : null}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Recent reviews</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {reviews.length}
            </span>
          </div>
          <ReviewList reviews={reviews} isAuthConfigured={isAuthConfigured} viewerProfileId={viewerProfile?.id ?? null} />
        </section>
      </section>
    </main>
  );
}
