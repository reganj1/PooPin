import { BathroomRatingSummary, Review, ReviewQuickTag } from "@/types";
import { buildTopReviewSignals, getReviewAggregationWeight, getReviewCategoryRatingsForAggregation, getReviewQuickTagsForDisplay } from "@/lib/utils/reviewSignals";

type ReviewRatingField = "cleanliness_rating" | "smell_rating" | "wait_rating" | "privacy_rating";

export type ReviewTone = "positive" | "neutral" | "negative";

export interface ReviewRatingLabel {
  label: string;
  tone: ReviewTone;
}

export interface ReviewAggregateSummary {
  reviewCount: number;
  recentReviewCount: number;
  overall: number;
  cleanliness: number | null;
  smell: number | null;
  wait: number | null;
  privacy: number | null;
  topSignals: ReviewQuickTag[];
  summaryLabel: string;
  summaryNote: string;
  categoryInsights: ReviewAggregateInsight[];
}

export interface ReviewAggregateInsight {
  key: "cleanliness" | "smell" | "wait" | "privacy";
  title: string;
  label: string;
  tone: ReviewTone;
}

const roundToOne = (value: number) => Math.round(value * 10) / 10;
const RECENT_REVIEW_WINDOW_DAYS = 120;
const OVERALL_PRIOR_MEAN = 3.6;
const OVERALL_PRIOR_WEIGHT = 1.5;
const CATEGORY_PRIOR_MEAN = 3.5;
const CATEGORY_PRIOR_WEIGHT = 1.75;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_CATEGORY_EVIDENCE = 1.05;

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

interface WeightedEntry {
  value: number;
  weight: number;
}

interface WeightedMetricSnapshot {
  score: number | null;
  effectiveWeight: number;
  positiveWeight: number;
  negativeWeight: number;
}

const categoryConfig = {
  cleanliness: {
    field: "cleanliness_rating",
    title: "Cleanliness",
    limited: "Limited cleanliness detail",
    mixed: "Mixed cleanliness reports",
    positive: "Generally clean",
    neutral: "Cleanliness varies",
    negative: "Often reported dirty"
  },
  smell: {
    field: "smell_rating",
    title: "Smell",
    limited: "Limited smell detail",
    mixed: "Mixed smell reports",
    positive: "Smell usually okay",
    neutral: "Smell can vary",
    negative: "Often reported as smelly"
  },
  wait: {
    field: "wait_rating",
    title: "Wait",
    limited: "Limited wait detail",
    mixed: "Mixed wait reports",
    positive: "Usually short wait",
    neutral: "Wait can vary",
    negative: "Wait can run long"
  },
  privacy: {
    field: "privacy_rating",
    title: "Privacy",
    limited: "Limited privacy detail",
    mixed: "Mixed privacy reports",
    positive: "Generally private",
    neutral: "Privacy varies",
    negative: "Privacy concerns reported"
  }
} as const satisfies Record<
  "cleanliness" | "smell" | "wait" | "privacy",
  {
    field: ReviewRatingField;
    title: string;
    limited: string;
    mixed: string;
    positive: string;
    neutral: string;
    negative: string;
  }
>;

const toWeightedScore = (entries: WeightedEntry[], priorMean: number, priorWeight: number) => {
  if (entries.length === 0) {
    return null;
  }

  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  const weightedTotal = entries.reduce((total, entry) => total + entry.value * entry.weight, 0);
  return roundToOne((weightedTotal + priorMean * priorWeight) / (totalWeight + priorWeight));
};

const toWeightedMetricSnapshot = (entries: WeightedEntry[]): WeightedMetricSnapshot => {
  if (entries.length === 0) {
    return {
      score: null,
      effectiveWeight: 0,
      positiveWeight: 0,
      negativeWeight: 0
    };
  }

  return {
    score: toWeightedScore(entries, CATEGORY_PRIOR_MEAN, CATEGORY_PRIOR_WEIGHT),
    effectiveWeight: entries.reduce((total, entry) => total + entry.weight, 0),
    positiveWeight: entries.reduce((total, entry) => total + (entry.value >= 4.2 ? entry.weight : 0), 0),
    negativeWeight: entries.reduce((total, entry) => total + (entry.value <= 2.4 ? entry.weight : 0), 0)
  };
};

const toReviewAgeDays = (createdAt: string) => {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return RECENT_REVIEW_WINDOW_DAYS + 1;
  }

  return Math.max(0, (Date.now() - createdAtMs) / MS_PER_DAY);
};

const countRecentReviews = (reviews: Review[]) => reviews.filter((review) => toReviewAgeDays(review.created_at) <= RECENT_REVIEW_WINDOW_DAYS).length;

const buildCategoryMetricSnapshot = (reviews: Review[], field: ReviewRatingField): WeightedMetricSnapshot => {
  const entries: WeightedEntry[] = [];

  for (const review of reviews) {
    const categoryRatings = getReviewCategoryRatingsForAggregation(review);
    const value = categoryRatings[field];
    if (typeof value !== "number") {
      continue;
    }

    entries.push({
      value,
      weight: getReviewAggregationWeight(review.created_at)
    });
  }

  return toWeightedMetricSnapshot(entries);
};

const toCategoryInsight = (
  key: ReviewAggregateInsight["key"],
  snapshot: WeightedMetricSnapshot
): ReviewAggregateInsight | null => {
  if (snapshot.effectiveWeight < MIN_CATEGORY_EVIDENCE || snapshot.score === null) {
    return null;
  }

  const config = categoryConfig[key];
  if (snapshot.positiveWeight >= snapshot.effectiveWeight * 0.28 && snapshot.negativeWeight >= snapshot.effectiveWeight * 0.28) {
    return {
      key,
      title: config.title,
      label: config.mixed,
      tone: "neutral"
    };
  }

  if (snapshot.score >= 4.1) {
    return {
      key,
      title: config.title,
      label: config.positive,
      tone: "positive"
    };
  }

  if (snapshot.score <= 2.6) {
    return {
      key,
      title: config.title,
      label: config.negative,
      tone: "negative"
    };
  }

  return {
    key,
    title: config.title,
    label: config.neutral,
    tone: "neutral"
  };
};

const buildOverallScore = (reviews: Review[]) => {
  const entries = reviews.map((review) => ({
    value: review.overall_rating,
    weight: getReviewAggregationWeight(review.created_at)
  }));

  const score = toWeightedScore(entries, OVERALL_PRIOR_MEAN, OVERALL_PRIOR_WEIGHT);
  return score ?? 0;
};

const buildSummaryLabel = (reviewCount: number, recentReviewCount: number) => {
  if (reviewCount <= 1) {
    return "Limited data";
  }

  if (recentReviewCount <= 1) {
    return "Limited recent data";
  }

  return "Based on recent reviews";
};

const buildSummaryNote = (reviewCount: number, recentReviewCount: number) => {
  if (reviewCount === 1) {
    return "One review so far. Treat this as an early signal rather than a settled pattern.";
  }

  if (recentReviewCount <= 1) {
    return "Older reviews still inform this snapshot, but newer visits carry more weight when available.";
  }

  return `Built from ${reviewCount} review${reviewCount === 1 ? "" : "s"}, with newer visits weighted more than older ones.`;
};

export const buildBathroomRatingSummary = (reviews: Review[]): BathroomRatingSummary => {
  if (reviews.length === 0) {
    return {
      overall: 0,
      smell: 0,
      cleanliness: 0,
      reviewCount: 0,
      qualitySignals: []
    };
  }

  const cleanlinessSnapshot = buildCategoryMetricSnapshot(reviews, "cleanliness_rating");
  const smellSnapshot = buildCategoryMetricSnapshot(reviews, "smell_rating");

  return {
    overall: buildOverallScore(reviews),
    smell: smellSnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? smellSnapshot.score ?? 0 : 0,
    cleanliness: cleanlinessSnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? cleanlinessSnapshot.score ?? 0 : 0,
    reviewCount: reviews.length,
    qualitySignals: buildTopReviewSignals(reviews, 2)
  };
};

export const buildReviewAggregateSummary = (reviews: Review[]): ReviewAggregateSummary | null => {
  if (reviews.length === 0) {
    return null;
  }

  const cleanlinessSnapshot = buildCategoryMetricSnapshot(reviews, "cleanliness_rating");
  const smellSnapshot = buildCategoryMetricSnapshot(reviews, "smell_rating");
  const waitSnapshot = buildCategoryMetricSnapshot(reviews, "wait_rating");
  const privacySnapshot = buildCategoryMetricSnapshot(reviews, "privacy_rating");
  const recentReviewCount = countRecentReviews(reviews);
  const categoryInsights = (
    [
      toCategoryInsight("cleanliness", cleanlinessSnapshot),
      toCategoryInsight("smell", smellSnapshot),
      toCategoryInsight("wait", waitSnapshot),
      toCategoryInsight("privacy", privacySnapshot)
    ] satisfies Array<ReviewAggregateInsight | null>
  ).filter((insight): insight is ReviewAggregateInsight => insight !== null);

  return {
    reviewCount: reviews.length,
    recentReviewCount,
    overall: buildOverallScore(reviews),
    cleanliness: cleanlinessSnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? cleanlinessSnapshot.score : null,
    smell: smellSnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? smellSnapshot.score : null,
    wait: waitSnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? waitSnapshot.score : null,
    privacy: privacySnapshot.effectiveWeight >= MIN_CATEGORY_EVIDENCE ? privacySnapshot.score : null,
    topSignals: buildTopReviewSignals(reviews, 2),
    summaryLabel: buildSummaryLabel(reviews.length, recentReviewCount),
    summaryNote: buildSummaryNote(reviews.length, recentReviewCount),
    categoryInsights
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
