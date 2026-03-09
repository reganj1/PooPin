export default function AddRestroomPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Coming Next</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Add a restroom</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          This page is intentionally a placeholder for the first MVP pass. In the next step we will wire a simple form
          with React Hook Form + Zod, then persist submissions into Supabase.
        </p>
      </section>
    </main>
  );
}
