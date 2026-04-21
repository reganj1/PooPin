"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { buildLoginHref } from "@/lib/auth/login";
import { CollectibleTitlePill } from "@/components/profile/CollectibleTitlePill";
import { cn } from "@/lib/utils/cn";
import { toReviewQuickTagChips } from "@/lib/utils/reviewPresentation";
import { getReviewQuickTagDescriptor, reviewQuickTagToneClassName } from "@/lib/utils/reviewSignals";
import { ReviewReportAction } from "@/components/review/ReviewReportAction";
import { isReviewWithinFreshDeleteWindow } from "@/lib/reviews/policy";
import type { Review, ReviewComment } from "@/types";

interface ReviewListProps {
  reviews: Review[];
  isAuthConfigured: boolean;
  viewerProfileId: string | null;
}

interface ReviewLikeResponse {
  success?: boolean;
  liked?: boolean;
  error?: string;
}

interface ReviewCommentResponse {
  success?: boolean;
  comment?: ReviewComment;
  error?: string;
}

interface ReviewDeleteResponse {
  success?: boolean;
  reviewId?: string;
  error?: string;
}

type ReviewWithEngagement = Review & {
  like_count: number;
  viewer_has_liked: boolean;
  comment_count: number;
  featured_comment: ReviewComment | null;
  comments: ReviewComment[];
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

const reviewLoginHrefForReview = (review: Review) => buildLoginHref(`/restroom/${review.bathroom_id}#review-${review.id}`);

const normalizeReview = (review: Review): ReviewWithEngagement => ({
  ...review,
  like_count: review.like_count ?? 0,
  viewer_has_liked: review.viewer_has_liked ?? false,
  comment_count: review.comment_count ?? review.comments?.length ?? 0,
  featured_comment: review.featured_comment ?? review.comments?.[0] ?? null,
  comments: review.comments ?? []
});

const trimPreview = (value: string, maxLength = 150) => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const getReviewHashId = (reviewId: string) => `review-${reviewId}`;

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
  textArea.style.pointerEvents = "none";
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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("h-4 w-4", filled ? "fill-current" : "fill-none")}>
      <path
        d="M10 16.3 4.4 11a3.8 3.8 0 0 1 5.4-5.3l.2.2.2-.2A3.8 3.8 0 1 1 15.6 11L10 16.3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5.2 5.5h9.6a1.7 1.7 0 0 1 1.7 1.7v5.1a1.7 1.7 0 0 1-1.7 1.7H9.4l-3.4 2.5.5-2.5H5.2a1.7 1.7 0 0 1-1.7-1.7V7.2a1.7 1.7 0 0 1 1.7-1.7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M14.7 6.1a2.1 2.1 0 1 0-2.1-2.1 2.1 2.1 0 0 0 2.1 2.1Zm-9.2 5a2.1 2.1 0 1 0 2.1 2.1 2.1 2.1 0 0 0-2.1-2.1Zm9.2 2.8a2.1 2.1 0 1 0 2.1 2.1 2.1 2.1 0 0 0-2.1-2.1Zm-7.2-1.2 5-2.6m-5-1.8 5-2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

interface ReviewCardProps {
  review: ReviewWithEngagement;
  isAuthConfigured: boolean;
  viewerProfileId: string | null;
  isHighlighted: boolean;
  buildPublicProfileHref: (profileId: string) => string;
  onReviewChange: (reviewId: string, updater: (review: ReviewWithEngagement) => ReviewWithEngagement) => void;
  onReviewDelete: (reviewId: string) => void;
}

function ReviewCard({
  review,
  isAuthConfigured,
  viewerProfileId,
  isHighlighted,
  buildPublicProfileHref,
  onReviewChange,
  onReviewDelete
}: ReviewCardProps) {
  const [isCommentsExpanded, setIsCommentsExpanded] = useState(false);
  const [isLikePending, setIsLikePending] = useState(false);
  const [isCommentPending, setIsCommentPending] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const isOwnReview = Boolean(viewerProfileId && review.profile_id === viewerProfileId);
  const canDeleteFreshReview = isOwnReview && isReviewWithinFreshDeleteWindow(review.created_at, currentTime);

  useEffect(() => {
    if (!isOwnReview) {
      return undefined;
    }

    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [isOwnReview]);

  useEffect(() => {
    if (!isHighlighted) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsCommentsExpanded((current) => current || review.comment_count > 0);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [isHighlighted, review.comment_count]);

  useEffect(() => {
    if (shareStatus !== "copied") {
      return;
    }

    const timeout = window.setTimeout(() => setShareStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [shareStatus]);

  const commentToggleLabel =
    review.comment_count > 0
      ? `${isCommentsExpanded ? "Hide" : "View"} ${review.comment_count} comment${review.comment_count === 1 ? "" : "s"}`
      : isCommentsExpanded
        ? "Hide comments"
        : "Add comment";

  const requireSignIn = () => {
    if (!isAuthConfigured) {
      return;
    }

    window.location.assign(reviewLoginHrefForReview(review));
  };

  const handleLike = async () => {
    if (!viewerProfileId) {
      requireSignIn();
      return;
    }

    setActionError(null);
    setIsLikePending(true);

    try {
      const response = await fetch(`/api/reviews/${review.id}/like`, {
        method: review.viewer_has_liked ? "DELETE" : "POST"
      });
      const result = (await response.json()) as ReviewLikeResponse;

      if (!response.ok) {
        setActionError(result.error ?? "Could not update your like right now.");
        return;
      }

      onReviewChange(review.id, (currentReview) => {
        const nextLiked = Boolean(result.liked);
        const likeDelta = nextLiked === currentReview.viewer_has_liked ? 0 : nextLiked ? 1 : -1;
        return {
          ...currentReview,
          viewer_has_liked: nextLiked,
          like_count: Math.max(0, currentReview.like_count + likeDelta)
        };
      });
    } catch (error) {
      console.error("[Poopin] review like toggle failed", error);
      setActionError("Could not update your like right now.");
    } finally {
      setIsLikePending(false);
    }
  };

  const handleShare = async () => {
    setActionError(null);
    const shareUrl = `${window.location.origin}/restroom/${review.bathroom_id}#${getReviewHashId(review.id)}`;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: "Poopin review",
          text: review.review_text.trim() || "See this restroom review on Poopin.",
          url: shareUrl
        });
        return;
      }

      await copyText(shareUrl);
      setShareStatus("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("[Poopin] review share failed", error);
      setActionError("Could not share this review right now.");
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!viewerProfileId) {
      requireSignIn();
      return;
    }

    setActionError(null);
    setIsCommentPending(true);

    try {
      const response = await fetch(`/api/reviews/${review.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: commentBody })
      });
      const result = (await response.json()) as ReviewCommentResponse;

      if (!response.ok || !result.comment) {
        setActionError(result.error ?? "Could not add your comment right now.");
        return;
      }

      onReviewChange(review.id, (currentReview) => {
        const nextComments = [...currentReview.comments, result.comment as ReviewComment];
        return {
          ...currentReview,
          comments: nextComments,
          comment_count: nextComments.length,
          featured_comment: currentReview.featured_comment ?? nextComments[0] ?? null
        };
      });
      setCommentBody("");
      setIsCommentsExpanded(true);
    } catch (error) {
      console.error("[Poopin] review comment failed", error);
      setActionError("Could not add your comment right now.");
    } finally {
      setIsCommentPending(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteFreshReview || isDeletePending) {
      return;
    }

    const confirmed = window.confirm("Delete this fresh review? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setIsDeletePending(true);

    try {
      const response = await fetch(`/api/reviews/${review.id}`, {
        method: "DELETE"
      });
      const result = (await response.json()) as ReviewDeleteResponse;

      if (!response.ok) {
        setActionError(result.error ?? "Could not delete this review right now.");
        return;
      }

      onReviewDelete(review.id);
    } catch (error) {
      console.error("[Poopin] review delete failed", error);
      setActionError("Could not delete this review right now.");
    } finally {
      setIsDeletePending(false);
    }
  };

  return (
    <article
      id={getReviewHashId(review.id)}
      className={cn(
        "scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition sm:scroll-mt-40 sm:p-5",
        isHighlighted && "border-brand-300 ring-2 ring-brand-100"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 sm:gap-2">
        {review.profile_id ? (
          <Link href={buildPublicProfileHref(review.profile_id)} className="font-medium text-slate-600 transition hover:text-slate-900">
            {review.author_display_name?.trim() || "Anonymous"}
          </Link>
        ) : (
          <span className="font-medium text-slate-600">{review.author_display_name?.trim() || "Anonymous"}</span>
        )}
        {review.author_collectible_title && review.author_collectible_rarity ? (
          <CollectibleTitlePill title={review.author_collectible_title} rarity={review.author_collectible_rarity} />
        ) : null}
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
          Overall {review.overall_rating.toFixed(1)}
        </span>
        <span>Visited {formatDate(review.visit_time)}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 sm:gap-2">
        {toReviewQuickTagChips(review).map((tag) => {
          const descriptor = getReviewQuickTagDescriptor(tag);
          if (!descriptor) {
            return null;
          }

          return (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                reviewQuickTagToneClassName[descriptor.tone]
              )}
            >
              {descriptor.icon} {descriptor.label}
            </span>
          );
        })}
      </div>

      {review.review_text.trim().length > 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-700">{review.review_text}</p>
      ) : (
        <p className="mt-3 text-sm italic text-slate-500">No additional notes shared.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={handleLike}
          disabled={isLikePending}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
            review.viewer_has_liked ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
            isLikePending && "cursor-not-allowed opacity-70"
          )}
        >
          <HeartIcon filled={review.viewer_has_liked} />
          <span>{review.like_count}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsCommentsExpanded((current) => !current)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate-50 px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
        >
          <CommentIcon />
          <span>{commentToggleLabel}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate-50 px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
        >
          <ShareIcon />
          <span>{shareStatus === "copied" ? "Copied" : "Share"}</span>
        </button>

        {canDeleteFreshReview ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeletePending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-rose-50 px-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeletePending ? "Deleting..." : "Delete"}
          </button>
        ) : null}
      </div>

      {!isCommentsExpanded && review.comment_count > 0 && review.featured_comment ? (
        <button
          type="button"
          onClick={() => setIsCommentsExpanded(true)}
          className="mt-3 flex w-full items-start gap-2.5 rounded-2xl bg-slate-50/85 px-3 py-2.5 text-left ring-1 ring-slate-200/70 transition hover:bg-slate-100/80"
        >
          <span className="mt-0.5 text-slate-400">
            <CommentIcon />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Top comment · {review.comment_count} total
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                {review.featured_comment.author_display_name?.trim() || "Anonymous"}
              </span>{" "}
              {trimPreview(review.featured_comment.body)}
            </p>
          </div>
        </button>
      ) : null}

      {isCommentsExpanded ? (
        <div className="mt-3 rounded-2xl bg-slate-50/90 px-3.5 py-3 ring-1 ring-slate-200/80">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Comments {review.comment_count > 0 ? `(${review.comment_count})` : ""}
            </p>
            <button
              type="button"
              onClick={() => setIsCommentsExpanded(false)}
              className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              Collapse
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {review.comments.length > 0 ? (
              review.comments.map((comment) => (
                <div key={comment.id} className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{comment.author_display_name?.trim() || "Anonymous"}</span>
                    <span>{formatDate(comment.created_at)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No comments yet. Start the conversation if you have a useful follow-up.</p>
            )}
          </div>

          <div className="mt-3 border-t border-slate-200 pt-3">
            {viewerProfileId ? (
              <form onSubmit={handleCommentSubmit} className="space-y-2.5">
                <label htmlFor={`review-comment-${review.id}`} className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Add comment
                </label>
                <textarea
                  id={`review-comment-${review.id}`}
                  rows={3}
                  minLength={2}
                  maxLength={320}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add a quick follow-up or helpful context."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">Comments stay public and are linked to your account.</p>
                  <button
                    type="submit"
                    disabled={isCommentPending}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCommentPending ? "Posting..." : "Post comment"}
                  </button>
                </div>
              </form>
            ) : isAuthConfigured ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">Sign in to join the comments on this review.</p>
                <Link
                  href={reviewLoginHrefForReview(review)}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Sign in to comment
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {actionError ? <p className="mt-3 text-xs font-medium text-rose-600">{actionError}</p> : null}

      <ReviewReportAction bathroomId={review.bathroom_id} reviewId={review.id} />
    </article>
  );
}

export function ReviewList({ reviews, isAuthConfigured, viewerProfileId }: ReviewListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reviewItems, setReviewItems] = useState<ReviewWithEngagement[]>(() => reviews.map(normalizeReview));
  const [highlightedReviewId, setHighlightedReviewId] = useState<string | null>(null);
  const reviewContextReturnTo = useMemo(() => {
    const queryString = searchParams.toString();
    return `${pathname}${queryString ? `?${queryString}` : ""}`;
  }, [pathname, searchParams]);
  const buildPublicProfileHref = (profileId: string) => `/u/${profileId}?returnTo=${encodeURIComponent(reviewContextReturnTo)}`;

  useEffect(() => {
    setReviewItems(reviews.map(normalizeReview));
  }, [reviews]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      setHighlightedReviewId(hash.startsWith("review-") ? hash.replace(/^review-/, "") : null);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const updateReview = (reviewId: string, updater: (review: ReviewWithEngagement) => ReviewWithEngagement) => {
    setReviewItems((currentReviews) => currentReviews.map((review) => (review.id === reviewId ? updater(review) : review)));
  };

  const deleteReview = (reviewId: string) => {
    setReviewItems((currentReviews) => currentReviews.filter((review) => review.id !== reviewId));
    router.refresh();
  };

  if (reviewItems.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-5 text-sm text-slate-600 ring-1 ring-slate-200/80">
        <p className="font-semibold text-slate-800">No reviews yet</p>
        <p className="mt-1">Be the first to share a quick restroom update.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {reviewItems.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          isAuthConfigured={isAuthConfigured}
          viewerProfileId={viewerProfileId}
          isHighlighted={highlightedReviewId === review.id}
          buildPublicProfileHref={buildPublicProfileHref}
          onReviewChange={updateReview}
          onReviewDelete={deleteReview}
        />
      ))}
    </div>
  );
}
