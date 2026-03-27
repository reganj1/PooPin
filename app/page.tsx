import { NearbyExplorer } from "@/components/home/NearbyExplorer";
import { isAuthConfigured } from "@/lib/auth/config";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getNearbyBathroomsData } from "@/lib/data/restrooms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [restrooms, authContext] = await Promise.all([
    getNearbyBathroomsData(),
    isAuthConfigured ? getAuthenticatedProfile() : Promise.resolve(null)
  ]);
  const shouldShowSignupValue = isAuthConfigured && !authContext;

  return (
    <main className="mx-auto w-full max-w-[1320px] overflow-x-hidden px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-5">
      <section className="mb-4 rounded-3xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6 lg:mx-auto lg:mb-5 lg:max-w-[880px] lg:px-7 lg:py-6 xl:max-w-[920px]">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">California Restroom Map</p>
          <h1 className="mt-2 text-[1.875rem] font-semibold leading-[1.05] tracking-tight text-slate-900 sm:max-w-[13ch] sm:text-[2.35rem] sm:leading-[1.02] lg:text-[2.55rem]">
            Never get stuck without a bathroom again
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600 sm:text-base">
            Find clean, nearby restrooms in seconds
          </p>
          <p className="mt-2 text-[13px] font-medium text-slate-500 sm:text-sm">2,000+ restrooms mapped across California</p>
        </div>
      </section>

      <NearbyExplorer initialRestrooms={restrooms} showSignupValue={shouldShowSignupValue} />
    </main>
  );
}
