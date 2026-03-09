import { NearbyExplorer } from "@/components/home/NearbyExplorer";
import { getNearbyBathroomsData } from "@/lib/data/restrooms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const restrooms = await getNearbyBathroomsData();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">MVP Foundation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Find a better restroom, faster.</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
          Discover nearby public restrooms with smell, cleanliness, and access friction ratings first. This is the
          first pass MVP with typed mock data and map-ready layout.
        </p>
      </section>

      <NearbyExplorer initialRestrooms={restrooms} />
    </main>
  );
}
