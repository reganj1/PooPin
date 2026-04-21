import Link from "next/link";
import {
  loginOpsAction,
  logoutOpsAction,
  markReportReviewedAction,
  moderateDuplicateWarningAction,
  moderateBathroomAction,
  moderatePhotoAction,
  moderateReviewAction,
  removeDuplicateListingAction
} from "@/app/ops/actions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOpsDashboardPassword, isOpsSessionAuthenticated } from "@/lib/ops/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  RESTROOM_ISSUE_REASON_PREFIX,
  REVIEW_REPORT_REASON_PREFIX,
  restroomIssueOptions,
  reviewReportOptions
} from "@/lib/utils/communitySignals";
import { BathroomSource, ModerationStatus } from "@/types";

export const dynamic = "force-dynamic";

const REVIEWED_REPORT_PREFIX = "reviewed:v1:";
const DUPLICATE_ISSUE_CODE = "duplicate_listing";
const MAX_QUEUE_ITEMS = 120;
const COMMUNITY_SOURCES: BathroomSource[] = ["user", "other"];

interface OpsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BathroomRow {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  place_type: string;
  access_type: string;
  is_accessible: boolean;
  requires_purchase: boolean;
  created_at: string;
  status: ModerationStatus;
  source: BathroomSource;
}

interface BathroomReferenceRow {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status?: ModerationStatus | null;
}

interface PhotoRow {
  id: string;
  bathroom_id: string;
  storage_path: string;
  created_at: string;
  status: ModerationStatus;
  bathrooms: BathroomReferenceRow | BathroomReferenceRow[] | null;
}

interface ReviewRow {
  id: string;
  bathroom_id: string;
  overall_rating: number;
  review_text: string | null;
  created_at: string;
  status: ModerationStatus;
  bathrooms: BathroomReferenceRow | BathroomReferenceRow[] | null;
}

interface ReportRow {
  id: string;
  bathroom_id: string;
  reason: string;
  created_at: string;
  bathrooms: BathroomReferenceRow | BathroomReferenceRow[] | null;
}

interface ReportNoteRow {
  id: string;
  report_id: string;
  comment: string;
}

interface ParsedReviewReport {
  reviewId: string;
  reasonCode: string;
}

interface ParsedRestroomIssue {
  issueCode: string;
}

interface ParsedReportReason {
  baseReason: string;
  isReviewed: boolean;
}

interface ReviewLookupRow {
  id: string;
  bathroom_id: string;
  status: ModerationStatus;
  overall_rating: number;
  review_text: string | null;
}

const toStringParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

const normalizeBathroomReference = (value: BathroomReferenceRow | BathroomReferenceRow[] | null) => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));

const truncateText = (value: string, max: number) => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trimEnd()}…`;
};

const sourceLabelByType: Record<BathroomSource, string> = {
  city_open_data: "Verified public facility",
  la_controller: "Verified public facility",
  openstreetmap: "Community mapped",
  google_places: "Partner source",
  partner: "Partner source",
  user: "Community submitted",
  other: "Community submitted"
};

const statusLabelByType: Record<ModerationStatus, string> = {
  active: "Active",
  pending: "Pending",
  flagged: "Flagged",
  removed: "Removed"
};

const statusClassByType: Record<ModerationStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  flagged: "border-rose-200 bg-rose-50 text-rose-700",
  removed: "border-slate-300 bg-slate-100 text-slate-600"
};

const reviewReasonLabelByCode: Map<string, string> = new Map(reviewReportOptions.map((option) => [option.value, option.label]));
const issueReasonLabelByCode: Map<string, string> = new Map(restroomIssueOptions.map((option) => [option.value, option.label]));

const parseReviewReport = (reason: string): ParsedReviewReport | null => {
  if (!reason.startsWith(REVIEW_REPORT_REASON_PREFIX)) {
    return null;
  }

  const payload = reason.slice(REVIEW_REPORT_REASON_PREFIX.length);
  const [reviewId, browserId, reasonCode] = payload.split(":");
  if (!reviewId || !browserId || !reasonCode) {
    return null;
  }

  return {
    reviewId,
    reasonCode
  };
};

const parseRestroomIssue = (reason: string): ParsedRestroomIssue | null => {
  if (!reason.startsWith(RESTROOM_ISSUE_REASON_PREFIX)) {
    return null;
  }

  const payload = reason.slice(RESTROOM_ISSUE_REASON_PREFIX.length);
  const [issueCode] = payload.split(":");
  if (!issueCode) {
    return null;
  }

  return {
    issueCode
  };
};

const parseReportReason = (reason: string): ParsedReportReason => {
  if (!reason.startsWith(REVIEWED_REPORT_PREFIX)) {
    return {
      baseReason: reason,
      isReviewed: false
    };
  }

  return {
    baseReason: reason.slice(REVIEWED_REPORT_PREFIX.length),
    isReviewed: true
  };
};

const toComparableText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceMiles = (origin: { lat: number; lng: number }, point: { lat: number; lng: number }) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(point.lat - origin.lat);
  const dLng = toRadians(point.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(point.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
};

const isWeakAddress = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  if (/^approximate location\s*\(/i.test(trimmed)) {
    return true;
  }

  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(trimmed);
};

const getBathroomDuplicateClue = (bathroom: BathroomRow, pool: BathroomRow[]) => {
  const sameAddressCount = pool.filter((candidate) => {
    if (candidate.id === bathroom.id) {
      return false;
    }

    return (
      toComparableText(candidate.address) === toComparableText(bathroom.address) &&
      toComparableText(candidate.city) === toComparableText(bathroom.city) &&
      toComparableText(candidate.state) === toComparableText(bathroom.state)
    );
  }).length;

  const sameNameNearbyCount = pool.filter((candidate) => {
    if (candidate.id === bathroom.id) {
      return false;
    }

    if (toComparableText(candidate.name) !== toComparableText(bathroom.name)) {
      return false;
    }

    return distanceMiles({ lat: bathroom.lat, lng: bathroom.lng }, { lat: candidate.lat, lng: candidate.lng }) <= 0.08;
  }).length;

  return {
    sameAddressCount,
    sameNameNearbyCount
  };
};

function StatusBadge({ status }: { status: ModerationStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassByType[status]}`}>
      {statusLabelByType[status]}
    </span>
  );
}

function QueueColumn({ title, subtitle, count, children }: { title: string; subtitle: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const renderEmptyState = (label: string) => (
  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{label}</p>
);

function ReportNoteBlock({ comment }: { comment?: string | null }) {
  if (!comment) {
    return null;
  }

  return (
    <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
      <span className="font-semibold text-slate-800">Reporter note: </span>
      {comment}
    </p>
  );
}

export default async function OpsPage({ searchParams }: OpsPageProps) {
  const resolvedSearchParams = await searchParams;
  const authState = toStringParam(resolvedSearchParams.auth).trim();
  const opsAction = toStringParam(resolvedSearchParams.ops_action).trim();
  const opsResult = toStringParam(resolvedSearchParams.ops_result).trim();
  const opsMessage = toStringParam(resolvedSearchParams.ops_message).trim();

  const configuredPassword = getOpsDashboardPassword();
  const hasOpsPasswordConfigured = configuredPassword.length > 0;
  const isAuthorized = await isOpsSessionAuthenticated();

  if (!hasOpsPasswordConfigured) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Ops Password Not Configured</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set <code>OPS_DASHBOARD_PASSWORD</code> to enable access protection for this dashboard.
          </p>
          <Link href="/" className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
            Back to map
          </Link>
        </section>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Internal Ops</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Sign in to moderation dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">This area is restricted to internal beta operations.</p>

          {authState === "invalid" ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Incorrect password. Please try again.
            </p>
          ) : null}

          <form action={loginOpsAction} className="mt-4 space-y-3">
            <label htmlFor="ops-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="ops-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const supabase = supabaseAdmin ?? getSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase is not configured, so ops queue data is unavailable.
        </section>
      </main>
    );
  }

  const [
    pendingBathroomsResponse,
    activeBathroomsResponse,
    removedBathroomsResponse,
    pendingPhotosResponse,
    activePhotosResponse,
    removedPhotosResponse,
    activeReviewsResponse,
    moderatedReviewsResponse,
    reportsResponse,
    reportNotesResponse
  ] = await Promise.all([
    supabase
      .from("bathrooms")
      .select("id, name, address, city, state, lat, lng, place_type, access_type, is_accessible, requires_purchase, created_at, status, source")
      .in("source", COMMUNITY_SOURCES)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("bathrooms")
      .select("id, name, address, city, state, lat, lng, place_type, access_type, is_accessible, requires_purchase, created_at, status, source")
      .in("source", COMMUNITY_SOURCES)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("bathrooms")
      .select("id, name, address, city, state, lat, lng, place_type, access_type, is_accessible, requires_purchase, created_at, status, source")
      .in("source", COMMUNITY_SOURCES)
      .in("status", ["removed", "flagged"])
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("photos")
      .select("id, bathroom_id, storage_path, created_at, status, bathrooms(id, name, city, address, lat, lng)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("photos")
      .select("id, bathroom_id, storage_path, created_at, status, bathrooms(id, name, city, address, lat, lng)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("photos")
      .select("id, bathroom_id, storage_path, created_at, status, bathrooms(id, name, city, address, lat, lng)")
      .in("status", ["removed", "flagged"])
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("reviews")
      .select("id, bathroom_id, overall_rating, review_text, created_at, status, bathrooms(id, name, city, address, lat, lng)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("reviews")
      .select("id, bathroom_id, overall_rating, review_text, created_at, status, bathrooms(id, name, city, address, lat, lng)")
      .in("status", ["removed", "flagged"])
      .order("created_at", { ascending: false })
      .limit(MAX_QUEUE_ITEMS),
    supabase
      .from("reports")
      .select("id, bathroom_id, reason, created_at, bathrooms(id, name, city, address, lat, lng, status)")
      .order("created_at", { ascending: false })
      .limit(260),
    supabaseAdmin
      ? supabaseAdmin.from("report_notes").select("id, report_id, comment").limit(260)
      : Promise.resolve({ data: [], error: null })
  ]);

  const queueErrors = [
    pendingBathroomsResponse.error ? `Pending restroom queue: ${pendingBathroomsResponse.error.message}` : null,
    activeBathroomsResponse.error ? `Active restroom queue: ${activeBathroomsResponse.error.message}` : null,
    removedBathroomsResponse.error ? `Removed restroom queue: ${removedBathroomsResponse.error.message}` : null,
    pendingPhotosResponse.error ? `Pending photo queue: ${pendingPhotosResponse.error.message}` : null,
    activePhotosResponse.error ? `Approved photo queue: ${activePhotosResponse.error.message}` : null,
    removedPhotosResponse.error ? `Removed photo queue: ${removedPhotosResponse.error.message}` : null,
    activeReviewsResponse.error ? `Active review queue: ${activeReviewsResponse.error.message}` : null,
    moderatedReviewsResponse.error ? `Removed review queue: ${moderatedReviewsResponse.error.message}` : null,
    reportsResponse.error ? `Reports queue: ${reportsResponse.error.message}` : null,
    reportNotesResponse.error ? `Report notes: ${reportNotesResponse.error.message}` : null
  ].filter((value): value is string => Boolean(value));

  const pendingBathrooms = (pendingBathroomsResponse.data ?? []) as BathroomRow[];
  const activeBathrooms = (activeBathroomsResponse.data ?? []) as BathroomRow[];
  const removedBathrooms = (removedBathroomsResponse.data ?? []) as BathroomRow[];

  const pendingPhotos = (pendingPhotosResponse.data ?? []) as PhotoRow[];
  const activePhotos = (activePhotosResponse.data ?? []) as PhotoRow[];
  const removedPhotos = (removedPhotosResponse.data ?? []) as PhotoRow[];

  const activeReviews = (activeReviewsResponse.data ?? []) as ReviewRow[];
  const moderatedReviews = (moderatedReviewsResponse.data ?? []) as ReviewRow[];

  const reportRows = (reportsResponse.data ?? []) as ReportRow[];
  const reportNotes = (reportNotesResponse.data ?? []) as ReportNoteRow[];
  const reportNoteByReportId = new Map<string, string>();
  for (const note of reportNotes) {
    if (!reportNoteByReportId.has(note.report_id)) {
      reportNoteByReportId.set(note.report_id, note.comment);
    }
  }

  const allSubmissionBathrooms = [...pendingBathrooms, ...activeBathrooms, ...removedBathrooms];
  const bathroomDuplicateClues = new Map(
    allSubmissionBathrooms.map((bathroom) => [bathroom.id, getBathroomDuplicateClue(bathroom, allSubmissionBathrooms)])
  );

  const reviewReports = reportRows
    .map((row) => {
      const parsedReason = parseReportReason(row.reason);
      const parsed = parseReviewReport(parsedReason.baseReason);
      if (!parsed) {
        return null;
      }

      return {
        ...row,
        ...parsed,
        storedReason: row.reason,
        isReviewed: parsedReason.isReviewed,
        note: reportNoteByReportId.get(row.id) ?? null,
        bathroom: normalizeBathroomReference(row.bathrooms)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const listingReports = reportRows
    .map((row) => {
      const parsedReason = parseReportReason(row.reason);
      const parsed = parseRestroomIssue(parsedReason.baseReason);
      if (!parsed) {
        return null;
      }

      return {
        ...row,
        ...parsed,
        storedReason: row.reason,
        isReviewed: parsedReason.isReviewed,
        note: reportNoteByReportId.get(row.id) ?? null,
        bathroom: normalizeBathroomReference(row.bathrooms)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const pendingDuplicateReports = listingReports.filter((report) => report.issueCode === DUPLICATE_ISSUE_CODE && !report.isReviewed);
  const reviewedDuplicateReports = listingReports.filter((report) => report.issueCode === DUPLICATE_ISSUE_CODE && report.isReviewed);
  const openListingReports = listingReports.filter((report) => report.issueCode !== DUPLICATE_ISSUE_CODE && !report.isReviewed);
  const openReviewReports = reviewReports.filter((report) => !report.isReviewed);

  const reportReviewIds = [...new Set(openReviewReports.map((report) => report.reviewId))];
  const reviewLookupById = new Map<string, ReviewLookupRow>();

  let reviewLookupErrorMessage: string | null = null;

  if (reportReviewIds.length > 0) {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, bathroom_id, status, overall_rating, review_text")
      .in("id", reportReviewIds)
      .limit(reportReviewIds.length);

    if (error) {
      reviewLookupErrorMessage = `Reported review lookup failed: ${error.message}`;
    }

    for (const row of (data ?? []) as ReviewLookupRow[]) {
      reviewLookupById.set(row.id, row);
    }
  }

  const canModerate = isSupabaseAdminConfigured;
  const showActionResult = opsResult === "success" || opsResult === "error";

  return (
    <main className="mx-auto w-full max-w-[1380px] px-4 py-6 sm:px-6 lg:py-8">
      <section className="mb-5 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Internal Ops</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Beta moderation dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review pending intake, audit approved content, and remove low-quality data quickly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {pendingBathrooms.length} pending restrooms
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {pendingPhotos.length} pending photos
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {openReviewReports.length + openListingReports.length + pendingDuplicateReports.length} open reports
            </span>
            <form action={logoutOpsAction}>
              <button
                type="submit"
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </form>
          </div>
        </div>

        {!canModerate ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Read-only mode: set <code>SUPABASE_SERVICE_ROLE_KEY</code> to enable moderation actions.
          </p>
        ) : null}

        {showActionResult ? (
          <p
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              opsResult === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <span className="font-semibold">{opsResult === "success" ? "Success" : "Action failed"}</span>
            {opsAction ? ` • ${opsAction.replaceAll("_", " ")}` : ""}
            {opsMessage ? ` • ${opsMessage}` : ""}
          </p>
        ) : null}

        {queueErrors.length > 0 || reviewLookupErrorMessage ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">Some moderation data could not be loaded.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {queueErrors.map((errorMessage) => (
                <li key={errorMessage}>{errorMessage}</li>
              ))}
              {reviewLookupErrorMessage ? <li>{reviewLookupErrorMessage}</li> : null}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Restroom submissions</h2>
            <p className="text-xs text-slate-500">Track pending, approved, and removed community restroom submissions.</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <QueueColumn title="Pending submissions" subtitle="Review new community entries." count={pendingBathrooms.length}>
              {pendingBathrooms.length === 0
                ? renderEmptyState("No pending restroom submissions.")
                : pendingBathrooms.map((bathroom) => {
                    const duplicateClue = bathroomDuplicateClues.get(bathroom.id);
                    const mapHref = `https://www.google.com/maps?q=${bathroom.lat},${bathroom.lng}`;

                    return (
                      <article key={bathroom.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom.name}</p>
                            <p className="text-xs text-slate-600">
                              {bathroom.address}, {bathroom.city}, {bathroom.state}
                            </p>
                          </div>
                          <StatusBadge status={bathroom.status} />
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-slate-500">
                          <p>
                            {sourceLabelByType[bathroom.source]} • Submitted {formatDateTime(bathroom.created_at)}
                          </p>
                          <p>
                            Coords: {bathroom.lat.toFixed(5)}, {bathroom.lng.toFixed(5)} •{" "}
                            <a href={mapHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 underline underline-offset-2">
                              Open map
                            </a>
                          </p>
                          <p>{isWeakAddress(bathroom.address) ? "Address quality: needs review" : "Address quality: usable"}</p>
                          <p>
                            Duplicate clues: {duplicateClue?.sameAddressCount ?? 0} same-address, {duplicateClue?.sameNameNearbyCount ?? 0} same-name nearby
                          </p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${bathroom.id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open listing
                          </Link>
                          {canModerate ? (
                            <form action={moderateBathroomAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="bathroom_id" value={bathroom.id} />
                              <button
                                type="submit"
                                name="status"
                                value="active"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Approve
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>

            <QueueColumn title="Recently approved" subtitle="Audit active community submissions." count={activeBathrooms.length}>
              {activeBathrooms.length === 0
                ? renderEmptyState("No approved community submissions yet.")
                : activeBathrooms.map((bathroom) => {
                    const mapHref = `https://www.google.com/maps?q=${bathroom.lat},${bathroom.lng}`;

                    return (
                      <article key={bathroom.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom.name}</p>
                            <p className="text-xs text-slate-600">
                              {bathroom.address}, {bathroom.city}, {bathroom.state}
                            </p>
                          </div>
                          <StatusBadge status={bathroom.status} />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">Submitted {formatDateTime(bathroom.created_at)} • Currently active</p>
                        <p className="mt-1 text-xs text-slate-500">
                          <a href={mapHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 underline underline-offset-2">
                            Open map
                          </a>
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${bathroom.id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open listing
                          </Link>
                          {canModerate ? (
                            <form action={moderateBathroomAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="bathroom_id" value={bathroom.id} />
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>

            <QueueColumn title="Rejected / removed" subtitle="Restore if removed in error." count={removedBathrooms.length}>
              {removedBathrooms.length === 0
                ? renderEmptyState("No removed restroom submissions.")
                : removedBathrooms.map((bathroom) => (
                    <article key={bathroom.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{bathroom.name}</p>
                          <p className="text-xs text-slate-600">
                            {bathroom.address}, {bathroom.city}, {bathroom.state}
                          </p>
                        </div>
                        <StatusBadge status={bathroom.status} />
                      </div>

                      <p className="mt-2 text-xs text-slate-500">Submitted {formatDateTime(bathroom.created_at)} • Currently removed</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${bathroom.id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open listing
                        </Link>
                        {canModerate ? (
                          <form action={moderateBathroomAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="bathroom_id" value={bathroom.id} />
                            <button
                              type="submit"
                              name="status"
                              value="active"
                              className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              Restore
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))}
            </QueueColumn>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Photo moderation</h2>
            <p className="text-xs text-slate-500">Moderate pending uploads and revisit approved media.</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <QueueColumn title="Pending photos" subtitle="Approve before public display." count={pendingPhotos.length}>
              {pendingPhotos.length === 0
                ? renderEmptyState("No pending photos.")
                : pendingPhotos.map((photo) => {
                    const bathroom = normalizeBathroomReference(photo.bathrooms);

                    return (
                      <article key={photo.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom?.name ?? "Unknown restroom"}</p>
                            <p className="text-xs text-slate-600">{bathroom?.city ?? "Unknown city"}</p>
                          </div>
                          <StatusBadge status={photo.status} />
                        </div>

                        <p className="mt-2 break-all text-xs text-slate-500">{truncateText(photo.storage_path, 90)}</p>
                        <p className="mt-1 text-xs text-slate-500">Uploaded {formatDateTime(photo.created_at)}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${photo.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>
                          {canModerate ? (
                            <form action={moderatePhotoAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="photo_id" value={photo.id} />
                              <input type="hidden" name="bathroom_id" value={photo.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="active"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Approve
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>

            <QueueColumn title="Approved photos" subtitle="Quick audit with remove action." count={activePhotos.length}>
              {activePhotos.length === 0
                ? renderEmptyState("No approved photos yet.")
                : activePhotos.map((photo) => {
                    const bathroom = normalizeBathroomReference(photo.bathrooms);

                    return (
                      <article key={photo.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom?.name ?? "Unknown restroom"}</p>
                            <p className="text-xs text-slate-600">{bathroom?.city ?? "Unknown city"}</p>
                          </div>
                          <StatusBadge status={photo.status} />
                        </div>

                        <p className="mt-2 break-all text-xs text-slate-500">{truncateText(photo.storage_path, 90)}</p>
                        <p className="mt-1 text-xs text-slate-500">Uploaded {formatDateTime(photo.created_at)} • Currently approved</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${photo.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>
                          {canModerate ? (
                            <form action={moderatePhotoAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="photo_id" value={photo.id} />
                              <input type="hidden" name="bathroom_id" value={photo.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>

            <QueueColumn title="Removed photos" subtitle="Restore if moderation was too strict." count={removedPhotos.length}>
              {removedPhotos.length === 0
                ? renderEmptyState("No removed photos.")
                : removedPhotos.map((photo) => {
                    const bathroom = normalizeBathroomReference(photo.bathrooms);

                    return (
                      <article key={photo.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom?.name ?? "Unknown restroom"}</p>
                            <p className="text-xs text-slate-600">{bathroom?.city ?? "Unknown city"}</p>
                          </div>
                          <StatusBadge status={photo.status} />
                        </div>

                        <p className="mt-2 break-all text-xs text-slate-500">{truncateText(photo.storage_path, 90)}</p>
                        <p className="mt-1 text-xs text-slate-500">Uploaded {formatDateTime(photo.created_at)} • Currently removed</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${photo.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>
                          {canModerate ? (
                            <form action={moderatePhotoAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="photo_id" value={photo.id} />
                              <input type="hidden" name="bathroom_id" value={photo.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="active"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Restore
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Review moderation</h2>
            <p className="text-xs text-slate-500">Reviews are live immediately. Use this queue for after-the-fact moderation.</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <QueueColumn title="Recent active reviews" subtitle="Audit live reviews and remove if needed." count={activeReviews.length}>
              {activeReviews.length === 0
                ? renderEmptyState("No recent active reviews.")
                : activeReviews.map((review) => {
                    const bathroom = normalizeBathroomReference(review.bathrooms);
                    return (
                      <article key={review.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom?.name ?? "Unknown restroom"}</p>
                            <p className="text-xs text-slate-600">Overall {review.overall_rating.toFixed(1)} • {bathroom?.city ?? "Unknown city"}</p>
                          </div>
                          <StatusBadge status={review.status} />
                        </div>

                        <p className="mt-2 text-sm text-slate-700">{review.review_text?.trim() || "No written note."}</p>
                        <p className="mt-2 text-xs text-slate-500">Created {formatDateTime(review.created_at)}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${review.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>
                          {canModerate ? (
                            <form action={moderateReviewAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="review_id" value={review.id} />
                              <input type="hidden" name="bathroom_id" value={review.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="flagged"
                                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                              >
                                Flag
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>

            <QueueColumn title="Removed / flagged reviews" subtitle="Restore reviews when moderation was incorrect." count={moderatedReviews.length}>
              {moderatedReviews.length === 0
                ? renderEmptyState("No removed or flagged reviews.")
                : moderatedReviews.map((review) => {
                    const bathroom = normalizeBathroomReference(review.bathrooms);
                    return (
                      <article key={review.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bathroom?.name ?? "Unknown restroom"}</p>
                            <p className="text-xs text-slate-600">Overall {review.overall_rating.toFixed(1)} • {bathroom?.city ?? "Unknown city"}</p>
                          </div>
                          <StatusBadge status={review.status} />
                        </div>

                        <p className="mt-2 text-sm text-slate-700">{review.review_text?.trim() || "No written note."}</p>
                        <p className="mt-2 text-xs text-slate-500">Created {formatDateTime(review.created_at)}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${review.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>
                          {canModerate ? (
                            <form action={moderateReviewAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="review_id" value={review.id} />
                              <input type="hidden" name="bathroom_id" value={review.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="active"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Restore
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Duplicate warnings</h2>
            <p className="text-xs text-slate-500">
              Keep duplicate decisions reversible with clear pending and reviewed queues.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <QueueColumn title="Pending duplicate warnings" subtitle="Review and choose keep or remove." count={pendingDuplicateReports.length}>
              {pendingDuplicateReports.length === 0
                ? renderEmptyState("No pending duplicate warnings.")
                : pendingDuplicateReports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                          <p className="text-xs text-slate-600">
                            {report.bathroom?.address ?? "Address unavailable"} • {report.bathroom?.city ?? "Unknown city"}
                          </p>
                        </div>
                        {report.bathroom?.status ? <StatusBadge status={report.bathroom.status} /> : null}
                      </div>

                      <p className="mt-2 text-xs text-slate-500">Warning opened {formatDateTime(report.created_at)}</p>
                      <ReportNoteBlock comment={report.note} />

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${report.bathroom_id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open listing
                        </Link>

                        {canModerate ? (
                          <>
                            <form action={moderateDuplicateWarningAction}>
                              <input type="hidden" name="report_id" value={report.id} />
                              <input type="hidden" name="reason" value={report.storedReason} />
                              <input type="hidden" name="bathroom_id" value={report.bathroom_id} />
                              <button
                                type="submit"
                                name="decision"
                                value="keep"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Keep listing
                              </button>
                            </form>

                            <form action={removeDuplicateListingAction}>
                              <input type="hidden" name="report_id" value={report.id} />
                              <input type="hidden" name="reason" value={report.storedReason} />
                              <input type="hidden" name="bathroom_id" value={report.bathroom_id} />
                              <button
                                type="submit"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove listing
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
            </QueueColumn>

            <QueueColumn title="Reviewed duplicate decisions" subtitle="Audit, reopen, or remove later." count={reviewedDuplicateReports.length}>
              {reviewedDuplicateReports.length === 0
                ? renderEmptyState("No reviewed duplicate decisions yet.")
                : reviewedDuplicateReports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                          <p className="text-xs text-slate-600">
                            {report.bathroom?.address ?? "Address unavailable"} • {report.bathroom?.city ?? "Unknown city"}
                          </p>
                        </div>
                        {report.bathroom?.status ? <StatusBadge status={report.bathroom.status} /> : null}
                      </div>

                      <p className="mt-2 text-xs text-slate-500">Decision recorded {formatDateTime(report.created_at)}</p>
                      <ReportNoteBlock comment={report.note} />

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${report.bathroom_id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open listing
                        </Link>

                        {canModerate ? (
                          <>
                            <form action={moderateDuplicateWarningAction}>
                              <input type="hidden" name="report_id" value={report.id} />
                              <input type="hidden" name="reason" value={report.storedReason} />
                              <input type="hidden" name="bathroom_id" value={report.bathroom_id} />
                              <button
                                type="submit"
                                name="decision"
                                value="reopen"
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Reopen warning
                              </button>
                            </form>

                            {report.bathroom?.status === "removed" ? (
                              <form action={moderateBathroomAction}>
                                <input type="hidden" name="bathroom_id" value={report.bathroom_id} />
                                <button
                                  type="submit"
                                  name="status"
                                  value="active"
                                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  Restore listing
                                </button>
                              </form>
                            ) : (
                              <form action={removeDuplicateListingAction}>
                                <input type="hidden" name="report_id" value={report.id} />
                                <input type="hidden" name="reason" value={report.storedReason} />
                                <input type="hidden" name="bathroom_id" value={report.bathroom_id} />
                                <button
                                  type="submit"
                                  className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  Remove listing
                                </button>
                              </form>
                            )}
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
            </QueueColumn>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Reports queue</h2>
            <p className="text-xs text-slate-500">Handle listing and review reports and apply moderation actions as needed.</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <QueueColumn title="Reported listings" subtitle="User-submitted listing issues." count={openListingReports.length}>
              {openListingReports.length === 0
                ? renderEmptyState("No open listing reports.")
                : openListingReports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {issueReasonLabelByCode.get(report.issueCode) ?? report.issueCode} • {formatDateTime(report.created_at)}
                      </p>
                      <ReportNoteBlock comment={report.note} />

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${report.bathroom_id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open restroom
                        </Link>
                        {canModerate ? (
                          <form action={markReportReviewedAction}>
                            <input type="hidden" name="report_id" value={report.id} />
                            <input type="hidden" name="reason" value={report.storedReason} />
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Resolve report
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))}
            </QueueColumn>

            <QueueColumn title="Reported reviews" subtitle="Review reports with direct moderation controls." count={openReviewReports.length}>
              {openReviewReports.length === 0
                ? renderEmptyState("No open review reports.")
                : openReviewReports.map((report) => {
                    const reviewLookup = reviewLookupById.get(report.reviewId);
                    return (
                      <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                          {reviewLookup ? <StatusBadge status={reviewLookup.status} /> : null}
                        </div>

                        <p className="mt-1 text-xs text-slate-600">
                          {reviewReasonLabelByCode.get(report.reasonCode) ?? report.reasonCode} • Review {report.reviewId.slice(0, 8)} •{" "}
                          {formatDateTime(report.created_at)}
                        </p>

                        {reviewLookup ? (
                          <p className="mt-2 text-sm text-slate-700">
                            Overall {reviewLookup.overall_rating.toFixed(1)} • {reviewLookup.review_text?.trim() || "No written note."}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-amber-700">Review row not found. It may already be removed.</p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/restroom/${report.bathroom_id}`}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Open restroom
                          </Link>

                          {canModerate && reviewLookup ? (
                            <form action={moderateReviewAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="review_id" value={reviewLookup.id} />
                              <input type="hidden" name="bathroom_id" value={reviewLookup.bathroom_id} />
                              <button
                                type="submit"
                                name="status"
                                value="active"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Keep
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="flagged"
                                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                              >
                                Flag
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="removed"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </form>
                          ) : null}

                          {canModerate ? (
                            <form action={markReportReviewedAction}>
                              <input type="hidden" name="report_id" value={report.id} />
                              <input type="hidden" name="reason" value={report.storedReason} />
                              <button
                                type="submit"
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Resolve report
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
            </QueueColumn>
          </div>
        </section>
      </section>
    </main>
  );
}
