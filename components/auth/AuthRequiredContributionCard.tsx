interface AuthRequiredContributionCardProps {
  title: string;
  description: string;
  loginHref: string;
  isAuthConfigured: boolean;
  id?: string;
  eyebrow?: string;
  ctaLabel?: string;
  reassurance?: string;
}

export function AuthRequiredContributionCard({
  title,
  description,
  loginHref,
  isAuthConfigured,
  id,
  eyebrow = "Log in to post",
  ctaLabel = "Sign in to continue",
  reassurance = "Anonymous browsing stays open. Login is only for contributions."
}: AuthRequiredContributionCardProps) {
  return (
    <section
      id={id}
      className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
                <path
                  d="M10 2.5a4 4 0 0 1 4 4V8h.6A2.4 2.4 0 0 1 17 10.4v4.1a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 14.5v-4.1A2.4 2.4 0 0 1 5.4 8H6V6.5a4 4 0 0 1 4-4Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
                <path d="M10 11v1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
              </svg>
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
          </div>
          <h2 className="mt-3 text-[1.2rem] font-semibold tracking-tight text-slate-900 sm:text-[1.45rem]">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
          <p className="mt-3 max-w-sm text-xs leading-5 text-slate-500">{reassurance}</p>
        </div>

        <div className="sm:shrink-0">
          {isAuthConfigured ? (
            <a
              href={loginHref}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto"
            >
              {ctaLabel}
            </a>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              Login is not configured yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
