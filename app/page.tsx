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
      <NearbyExplorer initialRestrooms={restrooms} showSignupValue={shouldShowSignupValue} />
    </main>
  );
}
