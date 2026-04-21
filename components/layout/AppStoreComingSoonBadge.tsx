import { cn } from "@/lib/utils/cn";

interface AppStoreComingSoonBadgeProps {
  className?: string;
  compact?: boolean;
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <rect
        x="6.5"
        y="2.75"
        width="7"
        height="14.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path d="M9 5h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
      <circle cx="10" cy="14.55" r="0.55" fill="currentColor" />
    </svg>
  );
}

export function AppStoreComingSoonBadge({ className, compact = false }: AppStoreComingSoonBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-950/[0.02]",
        compact ? "gap-1.5 px-2.5" : "sm:px-3",
        className
      )}
      aria-label="Coming soon to the App Store"
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
        <PhoneIcon className="h-3.5 w-3.5" />
      </span>
      <span className={compact ? "whitespace-nowrap" : "hidden whitespace-nowrap sm:inline"}>
        {compact ? "iPhone app coming soon" : "Coming soon to the App Store"}
      </span>
      {!compact ? <span className="whitespace-nowrap sm:hidden">iPhone app coming soon</span> : null}
    </span>
  );
}
