import Link from "next/link";
import {
  markReportReviewedAction,
  moderateBathroomAction,
  moderatePhotoAction,
  moderateReviewAction
} from "@/app/ops/actions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
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

interface OpsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BathroomRow {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  created_at: string;
  status: ModerationStatus;
  source: BathroomSource;
}

interface BathroomReferenceRow {
  id: string;
  name: string;
  city: string;
  address: string;
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

interface ParsedReviewReport {
  reviewId: string;
  reasonCode: string;
}

interface ParsedRestroomIssue {
  issueCode: string;
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

const sourceLabelByType: Record<BathroomSource, string> = {
  city_open_data: "Verified public facility",
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

function StatusBadge({ status }: { status: ModerationStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassByType[status]}`}>
      {statusLabelByType[status]}
    </span>
  );
}

function HiddenOpsKey({ opsKey }: { opsKey: string }) {
  if (!opsKey) {
    return null;
  }

  return <input type="hidden" name="ops_key" value={opsKey} />;
}

export default async function OpsPage({ searchParams }: OpsPageProps) {
  const resolvedSearchParams = await searchParams;
  const opsKey = toStringParam(resolvedSearchParams.key).trim();
  const expectedOpsKey = process.env.OPS_DASHBOARD_KEY?.trim() ?? "";
  const isAuthorized = expectedOpsKey ? opsKey === expectedOpsKey : true;

  if (!isAuthorized) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Ops Access Required</h1>
          <p className="mt-2 text-sm text-slate-600">
            This internal queue requires an ops key. Open <code>/ops?key=YOUR_KEY</code> with the configured key.
          </p>
          <Link href="/" className="mt-4 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
            Back to map
          </Link>
        </section>
      </main>
    );
  }

  const supabase = getSupabaseAdminClient() ?? getSupabaseServerClient();
  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase is not configured, so ops queue data is unavailable.
        </section>
      </main>
    );
  }

  const [pendingBathroomsResponse, pendingPhotosResponse, recentReviewsResponse, reportsResponse] = await Promise.all([
    supabase
      .from("bathrooms")
      .select("id, name, address, city, state, created_at, status, source")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("photos")
      .select("id, bathroom_id, storage_path, created_at, status, bathrooms(id, name, city, address)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("reviews")
      .select("id, bathroom_id, overall_rating, review_text, created_at, status, bathrooms(id, name, city, address)")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("reports")
      .select("id, bathroom_id, reason, created_at, bathrooms(id, name, city, address)")
      .not("reason", "like", `${REVIEWED_REPORT_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(150)
  ]);

  const pendingBathrooms = (pendingBathroomsResponse.data ?? []) as BathroomRow[];
  const pendingPhotos = (pendingPhotosResponse.data ?? []) as PhotoRow[];
  const recentReviews = (recentReviewsResponse.data ?? []) as ReviewRow[];
  const reportRows = (reportsResponse.data ?? []) as ReportRow[];

  const reviewReports = reportRows
    .map((row) => {
      const parsed = parseReviewReport(row.reason);
      if (!parsed) {
        return null;
      }

      return {
        ...row,
        ...parsed,
        bathroom: normalizeBathroomReference(row.bathrooms)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const listingReports = reportRows
    .map((row) => {
      const parsed = parseRestroomIssue(row.reason);
      if (!parsed) {
        return null;
      }

      return {
        ...row,
        ...parsed,
        bathroom: normalizeBathroomReference(row.bathrooms)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const canModerate = isSupabaseAdminConfigured;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">
      <section className="mb-5 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Internal Ops</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Beta moderation queue</h1>
            <p className="mt-1 text-sm text-slate-600">
              Monitor submissions, pending photos, reviews, and reports from Bay Area beta traffic.
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
              {reviewReports.length + listingReports.length} open reports
            </span>
          </div>
        </div>

        {!canModerate ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Read-only mode: set <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server to enable approve/reject actions.
          </p>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Pending restroom submissions</h2>
          <p className="mt-1 text-xs text-slate-500">Approve trusted listings or remove low-quality submissions.</p>

          <div className="mt-4 space-y-3">
            {pendingBathrooms.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No pending restroom submissions.</p>
            ) : (
              pendingBathrooms.map((bathroom) => (
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

                  <p className="mt-2 text-xs text-slate-500">
                    {sourceLabelByType[bathroom.source]} • Submitted {formatDateTime(bathroom.created_at)}
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
                        <HiddenOpsKey opsKey={opsKey} />
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
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Pending photos</h2>
          <p className="mt-1 text-xs text-slate-500">Review and moderate uploads before public display.</p>

          <div className="mt-4 space-y-3">
            {pendingPhotos.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No pending photos.</p>
            ) : (
              pendingPhotos.map((photo) => {
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

                    <p className="mt-2 break-all text-xs text-slate-500">{photo.storage_path}</p>
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
                          <HiddenOpsKey opsKey={opsKey} />
                          <input type="hidden" name="photo_id" value={photo.id} />
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
              })
            )}
          </div>
        </section>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Recent reviews</h2>
          <p className="mt-1 text-xs text-slate-500">Recent write activity with moderation controls.</p>

          <div className="mt-4 space-y-3">
            {recentReviews.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No recent reviews.</p>
            ) : (
              recentReviews.map((review) => {
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
                          <HiddenOpsKey opsKey={opsKey} />
                          <input type="hidden" name="review_id" value={review.id} />
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
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Reports queue</h2>
          <p className="mt-1 text-xs text-slate-500">Reported listings and reported reviews awaiting ops review.</p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Reported listings</p>
              <div className="space-y-2">
                {listingReports.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No open listing reports.</p>
                ) : (
                  listingReports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {issueReasonLabelByCode.get(report.issueCode) ?? report.issueCode} • {formatDateTime(report.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${report.bathroom_id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open restroom
                        </Link>
                        {canModerate ? (
                          <form action={markReportReviewedAction}>
                            <HiddenOpsKey opsKey={opsKey} />
                            <input type="hidden" name="report_id" value={report.id} />
                            <input type="hidden" name="reason" value={report.reason} />
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Mark reviewed
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Reported reviews</p>
              <div className="space-y-2">
                {reviewReports.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No open review reports.</p>
                ) : (
                  reviewReports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="font-semibold text-slate-900">{report.bathroom?.name ?? "Unknown restroom"}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {reviewReasonLabelByCode.get(report.reasonCode) ?? report.reasonCode} • Review {report.reviewId.slice(0, 8)} •{" "}
                        {formatDateTime(report.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/restroom/${report.bathroom_id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open restroom
                        </Link>
                        {canModerate ? (
                          <form action={markReportReviewedAction}>
                            <HiddenOpsKey opsKey={opsKey} />
                            <input type="hidden" name="report_id" value={report.id} />
                            <input type="hidden" name="reason" value={report.reason} />
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Mark reviewed
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
