import { redirect } from "next/navigation";
import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { ProfileCollectiblesPanel } from "@/components/profile/ProfileCollectiblesPanel";
import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { isAuthConfigured } from "@/lib/auth/config";
import { buildLoginHref, buildLogoutHref } from "@/lib/auth/login";
import { getProfileCollectibleProgress } from "@/lib/collectibles/progress";
import { formatPointEventLabel, getProfilePointsSummary } from "@/lib/points/pointEvents";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserEmail } from "@/lib/auth/sessionUser";

export default async function ProfilePage() {
  if (!isAuthConfigured) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm sm:p-6">
          Login is not configured yet.
        </section>
      </main>
    );
  }

  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    redirect(buildLoginHref("/profile"));
  }

  const { authUser, profile } = authContext;

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 shadow-sm sm:p-6">
          We could not load your profile right now. Please try again in a moment.
        </section>
      </main>
    );
  }

  const accountLabel = getSessionUserEmail(authUser) ?? "your account";
  const [pointsSummary, collectibleProgress] = await Promise.all([
    getProfilePointsSummary(profile.id, 5),
    getProfileCollectibleProgress(profile.id, profile.active_card_key)
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <MobileBackButton fallbackHref="/" className="mb-4" />

      <section className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Profile</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.35rem]">Your Poopin identity</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Signed in as <span className="break-all font-medium text-slate-700">{accountLabel}</span>. Browsing stays public, and this account only appears when you post reviews, photos, or restroom listings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Leaderboard {pointsSummary.totalPoints} pts
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              {collectibleProgress.activeCard.title}
            </span>
            <a
              href={buildLogoutHref("/")}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Log out
            </a>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <ProfileCollectiblesPanel progress={collectibleProgress} profileId={profile.id} displayName={profile.display_name} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Recent activity</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Latest point events</h2>
            </div>
            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {pointsSummary.totalPoints} pts
            </span>
          </div>

          {pointsSummary.recentEvents.length > 0 ? (
            <div className="mt-4 space-y-3">
              {pointsSummary.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{formatPointEventLabel(event.eventType)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(event.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    +{event.pointsDelta}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              No leaderboard points yet. Post a review, upload a photo, or add a restroom to start building your Poopin history.
            </p>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Account snapshot</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Display name</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{profile.display_name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sign-in email</p>
                <p className="mt-1 break-all text-sm font-medium text-slate-700">{accountLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Current card</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{collectibleProgress.activeCard.title}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unlock progress</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{collectibleProgress.contributionScore}</p>
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Leaderboard points reward weighted contribution value. Unlock progress is a separate collectible track based on contribution count.
              </p>
            </div>
          </section>

          <ProfileNameForm initialDisplayName={profile.display_name} />
        </aside>
      </div>
    </main>
  );
}
