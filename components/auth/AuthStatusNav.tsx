import Link from "next/link";
import { buildLoginHref, buildLogoutHref } from "@/lib/auth/login";

interface AuthStatusNavProps {
  isAuthConfigured: boolean;
  viewerDisplayName: string | null;
  variant?: "default" | "mobile";
}

const getViewerInitials = (viewerDisplayName: string) => {
  const cleaned = viewerDisplayName.trim();
  if (!cleaned) {
    return "PP";
  }

  const parts = cleaned.split(/\s+/).slice(0, 2);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part[0]).join("").toUpperCase();
};

export function AuthStatusNav({ isAuthConfigured, viewerDisplayName, variant = "default" }: AuthStatusNavProps) {
  if (!isAuthConfigured) {
    return null;
  }

  const isMobileVariant = variant === "mobile";

  if (!viewerDisplayName) {
    return (
      <Link
        href={buildLoginHref("/")}
        className={
          isMobileVariant
            ? "inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            : "inline-flex h-9 items-center rounded-lg border border-slate-200 px-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:px-3"
        }
      >
        Log in
      </Link>
    );
  }

  const initials = getViewerInitials(viewerDisplayName);

  return (
    <details className="group relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className={
          isMobileVariant
            ? "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            : "inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        }
        title={viewerDisplayName}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold tracking-wide text-white">
          {initials}
        </span>
        <span className={isMobileVariant ? "truncate" : "hidden max-w-[132px] truncate lg:inline"}>
          {isMobileVariant ? "Account" : viewerDisplayName}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={isMobileVariant ? "h-4 w-4 text-slate-400 transition group-open:rotate-180" : "hidden h-4 w-4 text-slate-400 transition group-open:rotate-180 lg:block"}
        >
          <path
            d="m5.5 7.5 4.5 5 4.5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </summary>

      <div
        className={
          isMobileVariant
            ? "absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
            : "absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
        }
      >
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{viewerDisplayName}</p>
        </div>
        <div className="mt-2 space-y-1">
          <Link
            href="/profile"
            className="flex min-h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
          >
            View profile
          </Link>
          <a
            href={buildLogoutHref("/")}
            className="flex min-h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            Log out
          </a>
        </div>
      </div>
    </details>
  );
}
