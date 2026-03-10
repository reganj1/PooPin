import { Review } from "@/types";
import { ReviewQuickTag } from "@/types";
import { buildTopReviewSignals, getReviewQuickTagsForDisplay } from "@/lib/utils/reviewSignals";

type ReviewRatingField = "cleanliness_rating" | "smell_rating" | "wait_rating" | "privacy_rating";

export type ReviewTone = "positive" | "neutral" | "negative";

export interface ReviewRatingLabel {
  label: string;
  tone: ReviewTone;
}

export interface ReviewAggregateSummary {
  reviewCount: number;
  overall: number;
  cleanliness: number;
  smell: number;
  wait: number;
  privacy: number;
  topSignals: ReviewQuickTag[];
}

const roundToOne = (value: number) => Math.round(value * 10) / 10;

const toneFromRating = (rating: number): ReviewTone => {
  if (rating >= 4) {
    return "positive";
  }

  if (rating <= 2.4) {
    return "negative";
  }

  return "neutral";
};

const toLabel = (
  rating: number,
  labels: {
    positive: string;
    neutral: string;
    negative: string;
  }
): ReviewRatingLabel => {
  const tone = toneFromRating(rating);
  return {
    tone,
    label: labels[tone]
  };
};

export const describeCleanliness = (rating: number) =>
  toLabel(rating, {
    positive: "Clean",
    neutral: "Okay",
    negative: "Dirty"
  });

export const describeSmell = (rating: number) =>
  toLabel(rating, {
    positive: "Good",
    neutral: "Neutral",
    negative: "Bad"
  });

export const describeWait = (rating: number) =>
  toLabel(rating, {
    positive: "No wait",
    neutral: "Short wait",
    negative: "Long wait"
  });

export const describePrivacy = (rating: number) =>
  toLabel(rating, {
    positive: "Good",
    neutral: "Average",
    negative: "Poor"
  });

export const reviewToneClassName: Record<ReviewTone, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-amber-200 bg-amber-50 text-amber-700",
  negative: "border-rose-200 bg-rose-50 text-rose-700"
};

export const buildReviewAggregateSummary = (reviews: Review[]): ReviewAggregateSummary | null => {
  if (reviews.length === 0) {
    return null;
  }

  const totals = reviews.reduce(
    (acc, review) => {
      acc.overall += review.overall_rating;
      acc.cleanliness += review.cleanliness_rating;
      acc.smell += review.smell_rating;
      acc.wait += review.wait_rating;
      acc.privacy += review.privacy_rating;
      return acc;
    },
    {
      overall: 0,
      cleanliness: 0,
      smell: 0,
      wait: 0,
      privacy: 0
    } satisfies Record<"overall" | "cleanliness" | "smell" | "wait" | "privacy", number>
  );

  return {
    reviewCount: reviews.length,
    overall: roundToOne(totals.overall / reviews.length),
    cleanliness: roundToOne(totals.cleanliness / reviews.length),
    smell: roundToOne(totals.smell / reviews.length),
    wait: roundToOne(totals.wait / reviews.length),
    privacy: roundToOne(totals.privacy / reviews.length),
    topSignals: buildTopReviewSignals(reviews, 2)
  };
};

export const toReviewDetailChips = (review: Pick<Review, ReviewRatingField>) => {
  return [
    {
      key: "cleanliness",
      title: "Cleanliness",
      score: review.cleanliness_rating,
      descriptor: describeCleanliness(review.cleanliness_rating)
    },
    {
      key: "smell",
      title: "Smell",
      score: review.smell_rating,
      descriptor: describeSmell(review.smell_rating)
    },
    {
      key: "wait",
      title: "Wait",
      score: review.wait_rating,
      descriptor: describeWait(review.wait_rating)
    },
    {
      key: "privacy",
      title: "Privacy",
      score: review.privacy_rating,
      descriptor: describePrivacy(review.privacy_rating)
    }
  ] as const;
};

export const toReviewQuickTagChips = (
  review: Pick<Review, "quick_tags" | "smell_rating" | "cleanliness_rating" | "wait_rating" | "privacy_rating">
) => getReviewQuickTagsForDisplay(review).slice(0, 2);
