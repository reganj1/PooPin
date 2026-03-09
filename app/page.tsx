import { NearbyExplorer } from "@/components/home/NearbyExplorer";
import { getNearbyBathroomsData } from "@/lib/data/restrooms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const restrooms = await getNearbyBathroomsData();

  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
      <section className="mb-5 rounded-3xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm sm:px-6 lg:mb-6 lg:px-7 lg:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">Public Restroom Discovery</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.15rem] sm:leading-tight">
              Find clean, reliable restrooms fast.
            </h1>
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Compare cleanliness, smell, and access details before you head over.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {restrooms.length}+ locations
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Live map browsing
            </span>
          </div>
        </div>
      </section>

      <NearbyExplorer initialRestrooms={restrooms} />
    </main>
  );
}
