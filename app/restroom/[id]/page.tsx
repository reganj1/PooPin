import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingPills } from "@/components/restroom/RatingPills";
import { RestroomTags } from "@/components/restroom/RestroomTags";
import { PhotoUploadForm } from "@/components/restroom/PhotoUploadForm";
import { RestroomPhotoGallery } from "@/components/restroom/RestroomPhotoGallery";
import { ReviewList } from "@/components/review/ReviewList";
import { ReviewForm } from "@/components/review/ReviewForm";
import { ReviewSummary } from "@/components/review/ReviewSummary";
import { getApprovedBathroomPhotosData } from "@/lib/data/photos";
import { getBathroomByIdData, getBathroomReviewsData } from "@/lib/data/restrooms";
import { getGoogleMapsDirectionsUrl } from "@/lib/utils/maps";
import { getRestroomDetailLocationLine, getRestroomDisplayName, getRestroomSourceLabel } from "@/lib/utils/restroomPresentation";

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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to nearby list
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{displayName}</h1>
            <p className="mt-2 text-sm text-slate-600">{locationLine}</p>
            <p className="mt-1 text-xs text-slate-500">
              Added {formatDate(restroom.created_at)} • {restroom.distanceMiles.toFixed(1)} mi from city center • {sourceLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={navigateHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <NavigateIcon className="h-4 w-4" />
              Navigate
            </a>
            <Link href="#add-review" className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700">
              Write a review
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <RatingPills ratings={restroom.ratings} />
          <RestroomTags restroom={restroom} />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coordinates</p>
          <p className="mt-2 text-sm text-slate-700">
            Lat {restroom.lat.toFixed(4)}, Lng {restroom.lng.toFixed(4)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Map pin detail will be linked here once live Mapbox rendering is added.</p>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
            <p className="mt-1 text-sm text-slate-500">Only approved photos are shown publicly.</p>
          </div>
          <PhotoUploadForm bathroomId={restroom.id} />
        </div>
        <RestroomPhotoGallery photos={approvedPhotos} />
      </section>

      <section className="mt-6">
        <ReviewForm bathroomId={restroom.id} />
      </section>

      {reviews.length > 0 ? (
        <section className="mt-6">
          <ReviewSummary reviews={reviews} />
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent reviews ({reviews.length})</h2>
        <ReviewList reviews={reviews} />
      </section>
    </main>
  );
}
