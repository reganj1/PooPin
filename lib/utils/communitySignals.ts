const BROWSER_ID_STORAGE_KEY = "poopin:browser-id";
const RESTROOM_CONFIRMATION_STORAGE_KEY = "poopin:restroom-confirmations";
const REVIEW_REPORT_STORAGE_KEY = "poopin:review-reports";

export const CONFIRMATION_REASON_PREFIX = "confirm_exists:v1:";
export const REVIEW_REPORT_REASON_PREFIX = "review_report:v1:";
export const RESTROOM_ISSUE_REASON_PREFIX = "restroom_issue:v1:";

interface RestroomConfirmationLog {
  [bathroomId: string]: number;
}

interface ReviewReportLog {
  [reviewId: string]: number;
}

export const restroomIssueOptions = [
  { value: "wrong_location", label: "Wrong location" },
  { value: "closed_restroom", label: "Closed restroom" },
  { value: "duplicate_listing", label: "Duplicate listing" },
  { value: "not_a_restroom", label: "Not a restroom" },
  { value: "other", label: "Other" }
] as const;

export type RestroomIssueCode = (typeof restroomIssueOptions)[number]["value"];

export const reviewReportOptions = [
  { value: "abusive_language", label: "Abusive language" },
  { value: "spam", label: "Spam or promotional content" },
  { value: "misleading", label: "Misleading information" },
  { value: "off_topic", label: "Not about this restroom" }
] as const;

export type ReviewReportCode = (typeof reviewReportOptions)[number]["value"];

const safeJsonParse = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const makeFallbackBrowserId = () => `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export const getOrCreateAnonymousBrowserId = () => {
  if (typeof window === "undefined") {
    return "server";
  }

  const storedBrowserId = window.localStorage.getItem(BROWSER_ID_STORAGE_KEY);
  if (storedBrowserId && storedBrowserId.length > 6) {
    return storedBrowserId;
  }

  const browserId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : makeFallbackBrowserId();
  window.localStorage.setItem(BROWSER_ID_STORAGE_KEY, browserId);
  return browserId;
};

const readConfirmationLog = (): RestroomConfirmationLog => {
  if (typeof window === "undefined") {
    return {};
  }

  return safeJsonParse<RestroomConfirmationLog>(window.localStorage.getItem(RESTROOM_CONFIRMATION_STORAGE_KEY), {});
};

export const hasConfirmedRestroomLocally = (bathroomId: string) => {
  const confirmationLog = readConfirmationLog();
  return typeof confirmationLog[bathroomId] === "number";
};

export const recordRestroomConfirmationLocally = (bathroomId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const confirmationLog = readConfirmationLog();
  confirmationLog[bathroomId] = Date.now();
  window.localStorage.setItem(RESTROOM_CONFIRMATION_STORAGE_KEY, JSON.stringify(confirmationLog));
};

const readReviewReportLog = (): ReviewReportLog => {
  if (typeof window === "undefined") {
    return {};
  }

  return safeJsonParse<ReviewReportLog>(window.localStorage.getItem(REVIEW_REPORT_STORAGE_KEY), {});
};

export const hasReportedReviewLocally = (reviewId: string) => {
  const reportLog = readReviewReportLog();
  return typeof reportLog[reviewId] === "number";
};

export const recordReviewReportLocally = (reviewId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const reportLog = readReviewReportLog();
  reportLog[reviewId] = Date.now();
  window.localStorage.setItem(REVIEW_REPORT_STORAGE_KEY, JSON.stringify(reportLog));
};

export const buildRestroomConfirmationReason = (browserId: string) => `${CONFIRMATION_REASON_PREFIX}${browserId}`;

export const parseRestroomConfirmationBrowserId = (reason: string) => {
  if (!reason.startsWith(CONFIRMATION_REASON_PREFIX)) {
    return null;
  }

  const browserId = reason.slice(CONFIRMATION_REASON_PREFIX.length).trim();
  return browserId.length > 0 ? browserId : null;
};

export const buildReviewReportReason = (reviewId: string, reasonCode: ReviewReportCode, browserId: string) =>
  `${REVIEW_REPORT_REASON_PREFIX}${reviewId}:${browserId}:${reasonCode}`;

export const buildReviewReportReasonPrefix = (reviewId: string, browserId: string) =>
  `${REVIEW_REPORT_REASON_PREFIX}${reviewId}:${browserId}:`;

export const buildRestroomIssueReason = (issueCode: RestroomIssueCode, browserId: string) =>
  `${RESTROOM_ISSUE_REASON_PREFIX}${issueCode}:${browserId}`;
