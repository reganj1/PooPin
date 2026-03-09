import { ApprovedBathroomPhoto } from "@/lib/data/photos";

interface RestroomPhotoGalleryProps {
  photos: ApprovedBathroomPhoto[];
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

export function RestroomPhotoGallery({ photos }: RestroomPhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No approved photos yet. Upload one to help others preview this restroom.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <figure key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Restroom photo" loading="lazy" className="h-36 w-full object-cover sm:h-40" />
          <figcaption className="border-t border-slate-100 px-2.5 py-2 text-[11px] text-slate-500">
            Approved {formatDate(photo.createdAt)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
