import { Review } from "@/types";
import { ReviewQuickTag } from "@/types";
import { buildTopReviewSignals, getReviewCategoryRatingsForAggregation, getReviewQuickTagsForDisplay } from "@/lib/utils/reviewSignals";

type ReviewRatingField = "cleanliness_rating" | "smell_rating" | "wait_rating" | "privacy_rating";

export type ReviewTone = "positive" | "neutral" | "negative";

export interface ReviewRatingLabel {
  label: string;
  tone: ReviewTone;
}

export interface ReviewAggregateSummary {
  reviewCount: number;
  overall: number;
  cleanliness: number | null;
  smell: number | null;
  wait: number | null;
  privacy: number | null;
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
      const categoryRatings = getReviewCategoryRatingsForAggregation(review);

      if (typeof categoryRatings.cleanliness_rating === "number") {
        acc.cleanliness += categoryRatings.cleanliness_rating;
        acc.cleanlinessCount += 1;
      }

      if (typeof categoryRatings.smell_rating === "number") {
        acc.smell += categoryRatings.smell_rating;
        acc.smellCount += 1;
      }

      if (typeof categoryRatings.wait_rating === "number") {
        acc.wait += categoryRatings.wait_rating;
        acc.waitCount += 1;
      }

      if (typeof categoryRatings.privacy_rating === "number") {
        acc.privacy += categoryRatings.privacy_rating;
        acc.privacyCount += 1;
      }

      return acc;
    },
    {
      overall: 0,
      cleanliness: 0,
      smell: 0,
      wait: 0,
      privacy: 0,
      cleanlinessCount: 0,
      smellCount: 0,
      waitCount: 0,
      privacyCount: 0
    } satisfies Record<"overall" | "cleanliness" | "smell" | "wait" | "privacy", number>
      & Record<"cleanlinessCount" | "smellCount" | "waitCount" | "privacyCount", number>
  );

  const toAverageOrNull = (total: number, count: number) => (count > 0 ? roundToOne(total / count) : null);

  return {
    reviewCount: reviews.length,
    overall: roundToOne(totals.overall / reviews.length),
    cleanliness: toAverageOrNull(totals.cleanliness, totals.cleanlinessCount),
    smell: toAverageOrNull(totals.smell, totals.smellCount),
    wait: toAverageOrNull(totals.wait, totals.waitCount),
    privacy: toAverageOrNull(totals.privacy, totals.privacyCount),
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
