import { NearbyExplorer } from "@/components/home/NearbyExplorer";
import { getNearbyBathroomsData } from "@/lib/data/restrooms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const restrooms = await getNearbyBathroomsData();

  return (
    <main className="mx-auto w-full max-w-[1320px] overflow-x-hidden px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-5">
      <section className="mb-4 rounded-3xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm sm:px-6 lg:mb-5 lg:px-7 lg:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">California Restroom Map</p>
            <h1 className="mt-1 text-[1.9rem] font-semibold tracking-tight text-slate-900 sm:text-[2.1rem] sm:leading-tight">
              Find clean, reliable restrooms fast.
            </h1>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
              Open the map, grab a top nearby option, and compare just a few high-signal details before you go.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:inline-flex">
              2000+ restrooms mapped
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              California beta
            </span>
          </div>
        </div>
      </section>

      <NearbyExplorer initialRestrooms={restrooms} />
    </main>
  );
}
