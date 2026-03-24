import type { Metadata } from "next";
import Link from "next/link";
import { AuthStatusNav } from "@/components/auth/AuthStatusNav";
import { Manrope } from "next/font/google";
import { isAuthConfigured } from "@/lib/auth/config";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserDisplayName } from "@/lib/auth/sessionUser";
import { LocationTrackingProvider } from "@/components/providers/LocationTrackingProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Poopin",
  description: "Discover and rate Bay Area public restrooms based on smell, cleanliness, and access friction.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";
  const authContext = isAuthConfigured ? await getAuthenticatedProfile() : null;
  const authUser = authContext?.authUser ?? null;
  const viewerProfile = authContext?.profile ?? null;

  const viewerDisplayName = viewerProfile?.display_name ?? getSessionUserDisplayName(authUser);

  return (
    <html lang="en">
      <body className={`${manrope.className} antialiased`}>
        <PostHogProvider posthogKey={posthogKey} posthogHost={posthogHost}>
          <LocationTrackingProvider>
            <div className="min-h-screen overflow-x-hidden">
              <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
                <div className="mx-auto w-full max-w-[1320px] min-w-0 px-4 sm:px-6 lg:px-8">
                  <div className="py-3 sm:py-4">
                    <div className="space-y-2.5 lg:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5 text-slate-900">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold tracking-wide text-white">
                            WC
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-lg font-semibold tracking-tight">Poopin</span>
                            <span className="block text-[11px] font-medium text-slate-500">Bay Area beta</span>
                          </div>
                        </Link>

                        <Link
                          href="/add"
                          className="inline-flex h-10 shrink-0 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        >
                          Add restroom
                        </Link>
                      </div>

                      <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50/85 p-1.5">
                        <Link
                          href="/leaderboard"
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
                        >
                          Leaderboard
                        </Link>
                        <Link
                          href="/contact"
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
                        >
                          Contact
                        </Link>
                        <AuthStatusNav
                          isAuthConfigured={isAuthConfigured}
                          viewerDisplayName={viewerDisplayName}
                          variant="mobile"
                        />
                      </nav>
                    </div>

                    <div className="hidden items-center justify-between gap-6 lg:flex">
                      <Link href="/" className="inline-flex min-w-0 items-center gap-2.5 text-slate-900">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold tracking-wide text-white">
                          WC
                        </span>
                        <span className="truncate text-lg font-semibold tracking-tight sm:text-xl">Poopin</span>
                        <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline-flex">
                          Bay Area beta
                        </span>
                      </Link>

                      <nav className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href="/leaderboard"
                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          Leaderboard
                        </Link>
                        <Link
                          href="/contact"
                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          Contact
                        </Link>

                        <div className="flex items-center gap-2">
                          <AuthStatusNav isAuthConfigured={isAuthConfigured} viewerDisplayName={viewerDisplayName} />
                          <Link
                            href="/add"
                            className="inline-flex h-9 items-center rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            Add restroom
                          </Link>
                        </div>
                      </nav>
                    </div>
                  </div>
                </div>
              </header>
              {children}
            </div>
          </LocationTrackingProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
