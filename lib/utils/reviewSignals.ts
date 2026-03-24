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
type ExplicitReviewQuickTagSource = Pick<Review, "quick_tags">;

const DAYS_PER_MONTH = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getReviewAgeInDays = (createdAt: string) => {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return 365;
  }

  return Math.max(0, (Date.now() - createdAtMs) / MS_PER_DAY);
};

export const getReviewAggregationWeight = (createdAt: string) => {
  const ageDays = getReviewAgeInDays(createdAt);
  if (ageDays <= DAYS_PER_MONTH) {
    return 1;
  }

  if (ageDays <= DAYS_PER_MONTH * 3) {
    return 0.85;
  }

  if (ageDays <= DAYS_PER_MONTH * 6) {
    return 0.65;
  }

  if (ageDays <= DAYS_PER_MONTH * 12) {
    return 0.45;
  }

  return 0.25;
};

const getExplicitReviewQuickTags = (review: ExplicitReviewQuickTagSource) => normalizeReviewQuickTags(review.quick_tags ?? []);

const opposingTagMap: Partial<Record<ReviewQuickTag, ReviewQuickTag[]>> = {
  clean: ["no_toilet_paper"],
  no_toilet_paper: ["clean"],
  no_line: ["crowded"],
  crowded: ["no_line"]
};

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
  // Restroom-level category summaries should only use explicit standout tags,
  // not inferred category ratings copied from an overall score.
  const normalizedTags = getExplicitReviewQuickTags(review);
  if (normalizedTags.length === 0) {
    return {};
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
  if (reviews.length < 2) {
    return [];
  }

  const recentReviews = [...reviews]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  const counts = new Map<ReviewQuickTag, number>();
  let totalReviewWeight = 0;

  for (const review of recentReviews) {
    const reviewWeight = getReviewAggregationWeight(review.created_at);
    totalReviewWeight += reviewWeight;

    const tags = getExplicitReviewQuickTags(review);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + reviewWeight);
    }
  }

  if (counts.size === 0 || totalReviewWeight < 1.4) {
    return [];
  }

  const minimumSupport = 1.15;
  const minimumShare = 0.34;

  return [...counts.entries()]
    .filter(([tag, count]) => {
      if (count < minimumSupport) {
        return false;
      }

      const supportShare = count / totalReviewWeight;
      if (supportShare < minimumShare) {
        return false;
      }

      const opposingSupport = (opposingTagMap[tag] ?? []).reduce((total, opposingTag) => total + (counts.get(opposingTag) ?? 0), 0);
      return opposingSupport < count * 0.85;
    })
    .sort((a, b) => b[1] - a[1] || (tagOrder.get(a[0]) ?? 99) - (tagOrder.get(b[0]) ?? 99))
    .slice(0, maxSignals)
    .map(([tag]) => tag);
};
