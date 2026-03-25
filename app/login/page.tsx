import { redirect } from "next/navigation";
import { SupabaseLoginForm } from "@/components/auth/SupabaseLoginForm";
import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { getAuthConfigIssue, isAuthConfigured } from "@/lib/auth/config";
import { getContributionIntent, sanitizeReturnTo } from "@/lib/auth/login";
import { getAuthenticatedProfile } from "@/lib/auth/server";

const getIntentFromReturnTo = (returnTo: string) => {
  try {
    const url = new URL(returnTo, "http://poopin.local");
    return getContributionIntent(url.searchParams.get("intent"));
  } catch {
    return null;
  }
};

const loginCopyByIntent = {
  review: {
    title: "Sign in to leave a review",
    description: "Post your review and we’ll bring you right back."
  },
  photo: {
    title: "Sign in to upload a photo",
    description: "Upload your photo and we’ll bring you right back."
  },
  "add-restroom": {
    title: "Sign in to add a restroom",
    description: "Add a new restroom listing and we’ll bring you right back."
  },
  default: {
    title: "Sign in to continue",
    description: "Use your email and we’ll bring you right back."
  }
} as const;

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const returnTo = sanitizeReturnTo(resolvedSearchParams.returnTo);
  const errorParam = Array.isArray(resolvedSearchParams.error) ? resolvedSearchParams.error[0] : resolvedSearchParams.error;
  const authContext = await getAuthenticatedProfile();
  const authConfigIssue = getAuthConfigIssue();
  const contributionIntent = getIntentFromReturnTo(returnTo);
  const loginCopy = contributionIntent ? loginCopyByIntent[contributionIntent] : loginCopyByIntent.default;
  const accountSetupIssue =
    authContext && !authContext.profile
      ? "We signed you in, but could not finish setting up your Poopin profile yet. Refresh and try again."
      : null;

  if (authContext?.profile) {
    redirect(returnTo);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-xl items-start justify-center px-4 py-5 sm:px-6 sm:py-8 lg:items-center">
      <div className="w-full">
        <MobileBackButton fallbackHref={returnTo} preferredHref={returnTo} className="mb-4" />

        <section className="w-full rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top,#eef6ff_0%,#ffffff_38%,#ffffff_100%)] p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:rounded-[34px] sm:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 shadow-sm">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold tracking-wide text-white">
            WC
          </span>
          Poopin account
        </div>
        <h1 className="mt-4 text-[2rem] font-semibold tracking-tight text-slate-900 sm:text-[2.35rem]">{loginCopy.title}</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600 sm:text-base">{loginCopy.description}</p>

        <div className="mt-5 border-t border-slate-200/80 pt-4 sm:mt-6 sm:pt-5">
          <SupabaseLoginForm
            returnTo={returnTo}
            isAuthConfigured={isAuthConfigured}
            errorParam={errorParam ?? null}
            configIssue={authConfigIssue}
            accountSetupIssue={accountSetupIssue}
          />
        </div>
        </section>
      </div>
    </main>
  );
}
