"use client";

import Image from "next/image";
import { TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApprovedBathroomPhoto } from "@/lib/data/photos";

interface RestroomPhotoGalleryProps {
  photos: ApprovedBathroomPhoto[];
}

const SWIPE_THRESHOLD_PX = 44;
const INLINE_PHOTO_LIMIT = 6;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

export function RestroomPhotoGallery({ photos }: RestroomPhotoGalleryProps) {
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [loadedInlinePhotoIds, setLoadedInlinePhotoIds] = useState<Set<string>>(() => new Set());
  const [failedInlinePhotoIds, setFailedInlinePhotoIds] = useState<Set<string>>(() => new Set());
  const [failedLightboxPhotoIds, setFailedLightboxPhotoIds] = useState<Set<string>>(() => new Set());
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isLightboxOpen = activePhotoIndex !== null;
  const activePhoto = useMemo(() => (activePhotoIndex === null ? null : photos[activePhotoIndex] ?? null), [activePhotoIndex, photos]);
  const hiddenPhotoCount = Math.max(0, photos.length - INLINE_PHOTO_LIMIT);
  const inlinePhotos = useMemo(() => photos.slice(0, INLINE_PHOTO_LIMIT), [photos]);
  const inlinePhotoSizes = "(max-width: 640px) 48vw, (max-width: 1024px) 30vw, 220px";

  const closeLightbox = useCallback(() => {
    setActivePhotoIndex(null);
  }, []);

  const markInlinePhotoLoaded = useCallback((photoId: string) => {
    setLoadedInlinePhotoIds((current) => {
      if (current.has(photoId)) {
        return current;
      }

      const next = new Set(current);
      next.add(photoId);
      return next;
    });
  }, []);

  const markInlinePhotoFailed = useCallback((photoId: string) => {
    setFailedInlinePhotoIds((current) => {
      if (current.has(photoId)) {
        return current;
      }

      const next = new Set(current);
      next.add(photoId);
      return next;
    });
  }, []);

  const markLightboxPhotoFailed = useCallback((photoId: string) => {
    setFailedLightboxPhotoIds((current) => {
      if (current.has(photoId)) {
        return current;
      }

      const next = new Set(current);
      next.add(photoId);
      return next;
    });
  }, []);

  const showPreviousPhoto = useCallback(() => {
    if (photos.length <= 1) {
      return;
    }

    setActivePhotoIndex((current) => {
      if (current === null) {
        return null;
      }

      return (current - 1 + photos.length) % photos.length;
    });
  }, [photos.length]);

  const showNextPhoto = useCallback(() => {
    if (photos.length <= 1) {
      return;
    }

    setActivePhotoIndex((current) => {
      if (current === null) {
        return null;
      }

      return (current + 1) % photos.length;
    });
  }, [photos.length]);

  const handleLightboxTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleLightboxTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (typeof startX !== "number" || typeof startY !== "number" || photos.length <= 1) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const endY = event.changedTouches[0]?.clientY ?? startY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX > 0) {
      showPreviousPhoto();
      return;
    }

    showNextPhoto();
  };

  useEffect(() => {
    if (!isLightboxOpen || typeof document === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isLightboxOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        showPreviousPhoto();
        return;
      }

      if (event.key === "ArrowRight") {
        showNextPhoto();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLightbox, isLightboxOpen, showNextPhoto, showPreviousPhoto]);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-5 text-sm text-slate-600 ring-1 ring-slate-200/80">
        <p className="font-semibold text-slate-800">No photos yet</p>
        <p className="mt-1">Uploads are reviewed before they appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {photos.length} approved photo{photos.length === 1 ? "" : "s"}
        </p>
        {photos.length > INLINE_PHOTO_LIMIT ? (
          <button
            type="button"
            onClick={() => setActivePhotoIndex(0)}
            className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
          >
            View all photos
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {inlinePhotos.map((photo, index) => {
          const isOverflowTile = hiddenPhotoCount > 0 && index === inlinePhotos.length - 1;
          const isInlinePhotoLoaded = loadedInlinePhotoIds.has(photo.id);
          const didInlinePhotoFail = failedInlinePhotoIds.has(photo.id);
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActivePhotoIndex(index)}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <div className="relative h-32 w-full sm:h-36">
                {!isInlinePhotoLoaded && !didInlinePhotoFail ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200"
                  />
                ) : null}
                {didInlinePhotoFail ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-xs font-semibold text-slate-600">
                    Photo unavailable
                  </div>
                ) : (
                  <Image
                    src={photo.thumbnailUrl}
                    alt="Restroom photo"
                    fill
                    sizes={inlinePhotoSizes}
                    loading={index === 0 ? "eager" : "lazy"}
                    priority={index === 0}
                    unoptimized
                    onLoad={() => markInlinePhotoLoaded(photo.id)}
                    onError={() => markInlinePhotoFailed(photo.id)}
                    className={`object-cover transition-opacity duration-200 ${isInlinePhotoLoaded ? "opacity-100" : "opacity-0"}`}
                  />
                )}
              </div>
              {isOverflowTile ? (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-sm font-semibold text-white">
                  +{hiddenPhotoCount} more
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isLightboxOpen && activePhoto ? (
        <div
          className="fixed inset-0 z-[130] bg-slate-950/90 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded restroom photos"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white transition hover:bg-black/70 sm:right-6 sm:top-6"
            aria-label="Close photo viewer"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
              <path
                d="M5 5 15 15M15 5 5 15"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.9"
              />
            </svg>
          </button>

          <div className="flex h-full items-center justify-center" onClick={closeLightbox}>
            <div
              className="w-full max-w-4xl"
              onClick={(event) => event.stopPropagation()}
              onTouchStart={handleLightboxTouchStart}
              onTouchEnd={handleLightboxTouchEnd}
            >
              <div className="relative h-[min(72vh,560px)] w-full overflow-hidden rounded-2xl bg-black">
                {failedLightboxPhotoIds.has(activePhoto.id) ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm font-semibold text-slate-200">
                    Photo unavailable
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activePhoto.url}
                    alt="Expanded restroom photo"
                    className="h-full w-full object-contain"
                    loading="eager"
                    decoding="async"
                    onError={() => markLightboxPhotoFailed(activePhoto.id)}
                  />
                )}

                {photos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={showPreviousPhoto}
                      className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition hover:bg-black/70"
                      aria-label="Previous photo"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
                        <path d="m12.5 4.5-5 5 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={showNextPhoto}
                      className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition hover:bg-black/70"
                      aria-label="Next photo"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
                        <path d="m7.5 4.5 5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                      </svg>
                    </button>
                  </>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
                <span>{formatDate(activePhoto.createdAt)}</span>
                <span>
                  {activePhotoIndex + 1} / {photos.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
