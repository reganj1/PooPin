import { AuthRequiredContributionCard } from "@/components/auth/AuthRequiredContributionCard";
import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { AddRestroomForm } from "@/components/restroom/AddRestroomForm";
import { isAuthConfigured } from "@/lib/auth/config";
import { buildContributionLoginHref } from "@/lib/auth/login";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserDisplayName } from "@/lib/auth/sessionUser";

export default async function AddRestroomPage() {
  const authContext = await getAuthenticatedProfile();
  const viewerProfile = authContext?.profile ?? null;
  const authUser = authContext?.authUser ?? null;

  const viewerDisplayName = viewerProfile?.display_name ?? getSessionUserDisplayName(authUser) ?? "your Poopin profile";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <MobileBackButton fallbackHref="/" className="mb-4" />

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
      {viewerProfile ? (
        <AddRestroomForm viewerDisplayName={viewerDisplayName} />
      ) : authUser ? (
        <section className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 shadow-sm sm:p-6">
          We could not load your account right now. Please refresh and try again.
        </section>
      ) : (
        <AuthRequiredContributionCard
          title="Add a restroom"
          description="Sign in to add a new restroom listing, and we’ll bring you straight back here to finish it."
          loginHref={buildContributionLoginHref("/add", "add-restroom")}
          isAuthConfigured={isAuthConfigured}
          eyebrow="Add restroom"
          ctaLabel="Sign in to add restroom"
          reassurance="Browsing stays open to everyone. Logging in just saves who submitted the listing."
        />
      )}
    </main>
  );
}
