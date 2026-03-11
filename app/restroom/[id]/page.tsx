import Link from "next/link";
import { notFound } from "next/navigation";
import { RestroomViewedTracker } from "@/components/analytics/RestroomViewedTracker";
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
import { getBathroomConfirmationCountData } from "@/lib/data/confirmations";
import { getApprovedBathroomPhotosData } from "@/lib/data/photos";
import { getBathroomByIdData, getBathroomReviewsData } from "@/lib/data/restrooms";
import { getGoogleMapsDirectionsUrl } from "@/lib/utils/maps";
import { getRestroomDetailLocationLine, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";

interface RestroomDetailPageProps {
  params: Promise<{
    id: string;
  }>;
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

export default async function RestroomDetailPage({ params }: RestroomDetailPageProps) {
  const { id } = await params;
  const restroom = await getBathroomByIdData(id);
  if (!restroom) {
    notFound();
  }

  const reviews = await getBathroomReviewsData(restroom.id);
  const navigateHref = getGoogleMapsDirectionsUrl(restroom.lat, restroom.lng);
  const displayName = getRestroomDisplayName(restroom);
  const locationLine = getRestroomDetailLocationLine(restroom);
  const sourceLabel = getRestroomSourceLabel(restroom.source);
  const approvedPhotos = await getApprovedBathroomPhotosData(restroom.id);
  const confirmationCount = await getBathroomConfirmationCountData(restroom.id);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <RestroomViewedTracker bathroomId={restroom.id} />
      <div className="mb-5">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to nearby list
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Restroom Listing</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.2rem]">{displayName}</h1>
            <p className="mt-2 text-sm text-slate-600">{locationLine}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {sourceLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                Added {formatDate(restroom.created_at)}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Enable location on the map for live distance
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <TrackedNavigateLink
              href={navigateHref}
              bathroomId={restroom.id}
              source="restroom_detail"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <NavigateIcon className="h-4 w-4" />
              Navigate
            </TrackedNavigateLink>
            <Link
              href="#add-review"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <NoteIcon className="h-4 w-4" />
              Write a review
            </Link>
          </div>
        </div>

        <div className="mt-5 space-y-3">
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

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <RestroomConfirmationCard bathroomId={restroom.id} initialCount={confirmationCount} />
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Listing quality</p>
            <p className="mt-1 text-sm text-slate-600">Notice an issue with this listing? Let us know and we will review it.</p>
            <div className="mt-2">
              <ReportIssueForm bathroomId={restroom.id} />
            </div>
          </section>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
            <p className="mt-1 text-sm text-slate-500">Only approved photos appear publicly.</p>
          </div>
          <PhotoUploadForm bathroomId={restroom.id} />
        </div>
        <RestroomPhotoGallery photos={approvedPhotos} />
      </section>

      <section className="mt-6 space-y-6">
        <ReviewForm bathroomId={restroom.id} />
        {reviews.length > 0 ? <ReviewSummary reviews={reviews} /> : null}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent reviews ({reviews.length})</h2>
          <ReviewList reviews={reviews} />
        </section>
      </section>
    </main>
  );
}
