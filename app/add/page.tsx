import { AddRestroomForm } from "@/components/restroom/AddRestroomForm";

export default function AddRestroomPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <section className="mb-5 rounded-3xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Bay Area Coverage</p>
            <p className="mt-1 text-sm text-slate-600">
              Poopin is currently focused on the Bay Area and expanding to more cities soon.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Public beta
          </span>
        </div>
      </section>
      <AddRestroomForm />
    </main>
  );
}
