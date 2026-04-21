export const REVIEW_DUPLICATE_WINDOW_HOURS = 12;
export const REVIEW_FRESH_DELETE_WINDOW_MINUTES = 15;

export const REVIEW_DUPLICATE_WINDOW_MS = REVIEW_DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
export const REVIEW_FRESH_DELETE_WINDOW_MS = REVIEW_FRESH_DELETE_WINDOW_MINUTES * 60 * 1000;

export const getReviewDuplicateCutoffIso = (now = new Date()) =>
  new Date(now.getTime() - REVIEW_DUPLICATE_WINDOW_MS).toISOString();

export const getFreshReviewDeleteCutoffIso = (now = new Date()) =>
  new Date(now.getTime() - REVIEW_FRESH_DELETE_WINDOW_MS).toISOString();

export const isReviewWithinFreshDeleteWindow = (createdAt: string, now = Date.now()) => {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return Math.max(0, now - createdAtMs) <= REVIEW_FRESH_DELETE_WINDOW_MS;
};
