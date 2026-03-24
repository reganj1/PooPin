import { redirect } from "next/navigation";
import { ProfileNameForm } from "@/components/profile/ProfileNameForm";
import { isAuthConfigured } from "@/lib/auth/config";
import { buildLoginHref, buildLogoutHref } from "@/lib/auth/login";
import { formatPointEventLabel, getProfilePointsSummary } from "@/lib/points/pointEvents";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserEmail } from "@/lib/auth/sessionUser";

export default async function ProfilePage() {
  if (!isAuthConfigured) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
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
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 shadow-sm sm:p-6">
          We could not load your profile right now. Please try again in a moment.
        </section>
      </main>
    );
  }

  const accountLabel = getSessionUserEmail(authUser) ?? "your account";
  const pointsSummary = await getProfilePointsSummary(profile.id, 5);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Account</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Your Poopin profile</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Signed in as <span className="break-all font-medium text-slate-700">{accountLabel}</span>. Browsing stays public, and this account is only used for posting reviews, photos, and restroom listings.
            </p>
          </div>

          <a
            href={buildLogoutHref("/")}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
          >
            Log out
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Display name</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{profile.display_name}</p>
            <p className="mt-1 text-sm text-slate-600">This is the name shown on your future reviews.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sign-in method</p>
            <p className="mt-1 break-all text-base font-semibold text-slate-900 sm:text-lg">{accountLabel}</p>
            <p className="mt-1 text-sm text-slate-600">Email one-time code sign-in is active for this account.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contribution points</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{pointsSummary.totalPoints}</p>
            <p className="mt-1 text-sm text-slate-600">Points from your reviews, photo uploads, and restroom submissions.</p>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
            No contribution points yet. Post a review, upload a photo, or add a restroom to start building your Poopin history.
          </p>
        )}
      </section>

      <div className="mt-5">
        <ProfileNameForm initialDisplayName={profile.display_name} />
      </div>
    </main>
  );
}
