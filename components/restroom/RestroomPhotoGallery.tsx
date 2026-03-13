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
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">No photos yet</p>
        <p className="mt-1">Uploads are reviewed before appearing here. Add a photo to help others know what to expect.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
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
