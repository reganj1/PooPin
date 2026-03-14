import type { Review, ReviewQuickTag } from "@/types";

type RatingField = "smell_rating" | "cleanliness_rating" | "wait_rating" | "privacy_rating";
type ReviewSignalTone = "positive" | "negative";

interface ReviewQuickTagDescriptor {
  value: ReviewQuickTag;
  label: string;
  icon: string;
  tone: ReviewSignalTone;
  ratingImpacts: Partial<Record<RatingField, number>>;
}

const tagDescriptors: readonly ReviewQuickTagDescriptor[] = [
  {
    value: "clean",
    label: "Clean",
    icon: "✨",
    tone: "positive",
    ratingImpacts: { cleanliness_rating: 5 }
  },
  {
    value: "smelly",
    label: "Smelly",
    icon: "🤢",
    tone: "negative",
    ratingImpacts: { smell_rating: 1 }
  },
  {
    value: "no_line",
    label: "No line",
    icon: "🚫",
    tone: "positive",
    ratingImpacts: { wait_rating: 5 }
  },
  {
    value: "crowded",
    label: "Crowded",
    icon: "🚻",
    tone: "negative",
    ratingImpacts: { wait_rating: 1 }
  },
  {
    value: "no_toilet_paper",
    label: "No toilet paper",
    icon: "🧻",
    tone: "negative",
    ratingImpacts: { cleanliness_rating: 1 }
  },
  {
    value: "locked",
    label: "Locked",
    icon: "🔒",
    tone: "negative",
    ratingImpacts: { privacy_rating: 1 }
  }
] as const;

const descriptorByTag = new Map<ReviewQuickTag, ReviewQuickTagDescriptor>(tagDescriptors.map((descriptor) => [descriptor.value, descriptor]));
const allowedTagValues = new Set<ReviewQuickTag>(tagDescriptors.map((descriptor) => descriptor.value));
const tagOrder = new Map<ReviewQuickTag, number>(tagDescriptors.map((descriptor, index) => [descriptor.value, index]));

const clampRating = (value: number) => Math.max(1, Math.min(5, value));
const roundToOne = (value: number) => Math.round(value * 10) / 10;

const toUniqueTags = (tags: (ReviewQuickTag | undefined | null)[]) => {
  const uniqueTags: ReviewQuickTag[] = [];
  for (const tag of tags) {
    if (!tag || uniqueTags.includes(tag)) {
      continue;
    }
    uniqueTags.push(tag);
  }
  return uniqueTags;
};

const isReviewQuickTag = (value: string): value is ReviewQuickTag => allowedTagValues.has(value as ReviewQuickTag);

export const reviewQuickTagValues = tagDescriptors.map((descriptor) => descriptor.value) as [
  ReviewQuickTag,
  ...ReviewQuickTag[]
];

export const reviewQuickTagOptions = tagDescriptors;

export const reviewQuickTagToneClassName: Record<ReviewSignalTone, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  negative: "border-rose-200 bg-rose-50 text-rose-700"
};

export const getReviewQuickTagDescriptor = (tag: ReviewQuickTag) => descriptorByTag.get(tag) ?? null;

export const toReviewQuickTagText = (tag: ReviewQuickTag) => {
  const descriptor = getReviewQuickTagDescriptor(tag);
  if (!descriptor) {
    return tag;
  }

  return `${descriptor.icon} ${descriptor.label}`;
};

export const isPositiveReviewQuickTag = (tag: ReviewQuickTag) => {
  const descriptor = getReviewQuickTagDescriptor(tag);
  return descriptor?.tone === "positive";
};

export const normalizeReviewQuickTags = (values: unknown): ReviewQuickTag[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const validTags = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value): value is ReviewQuickTag => isReviewQuickTag(value));

  return toUniqueTags(validTags);
};

interface ReviewLegacyRatingInput {
  smell_rating: number;
  cleanliness_rating: number;
  wait_rating: number;
  privacy_rating: number;
}

export const deriveReviewQuickTagsFromLegacyRatings = (review: ReviewLegacyRatingInput): ReviewQuickTag[] => {
  const candidates: Array<{ tag: ReviewQuickTag; strength: number }> = [];

  if (review.cleanliness_rating >= 4.2) {
    candidates.push({ tag: "clean", strength: review.cleanliness_rating - 3 });
  }
  if (review.smell_rating <= 2.4) {
    candidates.push({ tag: "smelly", strength: 3 - review.smell_rating });
  }
  if (review.wait_rating >= 4.2) {
    candidates.push({ tag: "no_line", strength: review.wait_rating - 3 });
  }
  if (review.wait_rating <= 2.4) {
    candidates.push({ tag: "crowded", strength: 3 - review.wait_rating });
  }
  if (review.cleanliness_rating <= 2.2) {
    candidates.push({ tag: "no_toilet_paper", strength: 3 - review.cleanliness_rating + 0.1 });
  }
  if (review.privacy_rating <= 2.2) {
    candidates.push({ tag: "locked", strength: 3 - review.privacy_rating + 0.1 });
  }

  return toUniqueTags(
    candidates
      .sort((a, b) => b.strength - a.strength || (tagOrder.get(a.tag) ?? 99) - (tagOrder.get(b.tag) ?? 99))
      .map((candidate) => candidate.tag)
      .slice(0, 2)
  );
};

type ReviewQuickTagSource = Pick<Review, "quick_tags" | "smell_rating" | "cleanliness_rating" | "wait_rating" | "privacy_rating">;

export const getReviewQuickTagsForDisplay = (review: ReviewQuickTagSource): ReviewQuickTag[] => {
  const normalized = normalizeReviewQuickTags(review.quick_tags ?? []);
  if (normalized.length > 0) {
    return normalized;
  }

  return deriveReviewQuickTagsFromLegacyRatings(review);
};

export const mapQuickTagsToDetailedRatings = (tags: ReviewQuickTag[], overallRating: number) => {
  const normalizedOverall = clampRating(overallRating);
  const normalizedTags = normalizeReviewQuickTags(tags);

  const impacts: Record<RatingField, number[]> = {
    smell_rating: [],
    cleanliness_rating: [],
    wait_rating: [],
    privacy_rating: []
  };

  for (const tag of normalizedTags) {
    const descriptor = getReviewQuickTagDescriptor(tag);
    if (!descriptor) {
      continue;
    }

    for (const [ratingField, ratingValue] of Object.entries(descriptor.ratingImpacts) as Array<[RatingField, number]>) {
      impacts[ratingField].push(ratingValue);
    }
  }

  const toResolvedRating = (field: RatingField) => {
    const values = impacts[field];
    if (values.length === 0) {
      return normalizedOverall;
    }

    const average = values.reduce((total, value) => total + value, 0) / values.length;
    return roundToOne(clampRating(average));
  };

  return {
    smell_rating: toResolvedRating("smell_rating"),
    cleanliness_rating: toResolvedRating("cleanliness_rating"),
    wait_rating: toResolvedRating("wait_rating"),
    privacy_rating: toResolvedRating("privacy_rating")
  };
};

type ReviewCategorySignalSource = Pick<Review, "quick_tags" | "overall_rating" | RatingField>;

export const getReviewCategoryRatingsForAggregation = (
  review: ReviewCategorySignalSource
): Partial<Record<RatingField, number>> => {
  const normalizedTags = normalizeReviewQuickTags(review.quick_tags ?? []);
  if (normalizedTags.length === 0) {
    return {
      smell_rating: review.smell_rating,
      cleanliness_rating: review.cleanliness_rating,
      wait_rating: review.wait_rating,
      privacy_rating: review.privacy_rating
    };
  }

  const impactedFields = new Set<RatingField>();
  for (const tag of normalizedTags) {
    const descriptor = getReviewQuickTagDescriptor(tag);
    if (!descriptor) {
      continue;
    }

    for (const field of Object.keys(descriptor.ratingImpacts) as RatingField[]) {
      impactedFields.add(field);
    }
  }

  if (impactedFields.size === 0) {
    return {};
  }

  return [...impactedFields].reduce<Partial<Record<RatingField, number>>>((acc, field) => {
    acc[field] = review[field];
    return acc;
  }, {});
};

type ReviewForSignalAggregate = Pick<
  Review,
  "quick_tags" | "smell_rating" | "cleanliness_rating" | "wait_rating" | "privacy_rating" | "created_at"
>;

export const buildTopReviewSignals = (reviews: ReviewForSignalAggregate[], maxSignals = 2): ReviewQuickTag[] => {
  if (reviews.length === 0) {
    return [];
  }

  const recentReviews = [...reviews]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  const counts = new Map<ReviewQuickTag, number>();
  for (const review of recentReviews) {
    const tags = getReviewQuickTagsForDisplay(review);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return [];
  }

  const minimumSupport = recentReviews.length >= 8 ? 2 : 1;

  return [...counts.entries()]
    .filter(([, count]) => count >= minimumSupport)
    .sort((a, b) => b[1] - a[1] || (tagOrder.get(a[0]) ?? 99) - (tagOrder.get(b[0]) ?? 99))
    .slice(0, maxSignals)
    .map(([tag]) => tag);
};
