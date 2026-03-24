function LoadingBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[24px] border border-slate-200 bg-white/85 ${className}`} />;
}

export default function LeaderboardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <LoadingBlock className="h-40 sm:h-32" />

      <section className="mt-5 grid gap-3 lg:grid-cols-3">
        <LoadingBlock className="h-44" />
        <LoadingBlock className="h-44" />
        <LoadingBlock className="h-44" />
      </section>

      <LoadingBlock className="mt-5 h-28" />

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="space-y-2.5">
          <LoadingBlock className="h-24" />
          <LoadingBlock className="h-24" />
          <LoadingBlock className="h-24" />
          <LoadingBlock className="h-24" />
          <LoadingBlock className="h-24" />
        </div>
      </section>
    </main>
  );
}
