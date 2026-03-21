import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";

  return (
    <html lang="en">
      <body className={`${manrope.className} antialiased`}>
        <PostHogProvider posthogKey={posthogKey} posthogHost={posthogHost}>
          <LocationTrackingProvider>
            <div className="min-h-screen overflow-x-hidden">
              <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-[1320px] min-w-0 items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
                  <Link href="/" className="inline-flex min-w-0 items-center gap-2 text-slate-900 sm:gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold tracking-wide text-white">
                      WC
                    </span>
                    <span className="truncate text-lg font-semibold tracking-tight sm:text-xl">Poopin</span>
                    <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline-flex">
                      Bay Area beta
                    </span>
                  </Link>
                  <nav className="flex shrink-0 items-center gap-1.5 text-sm font-medium sm:gap-2">
                    <Link
                      href="/contact"
                      className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:border-transparent sm:px-3 sm:py-2"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 sm:hidden">
                        <path
                          d="M2.5 5.5h15v9h-15z"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                        />
                        <path
                          d="m3.2 6 6.8 5.2L16.8 6"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                        />
                      </svg>
                      <span className="sr-only sm:hidden">Contact</span>
                      <span className="hidden sm:inline">Contact</span>
                    </Link>
                    <Link
                      href="/add"
                      className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:px-3.5"
                    >
                      <span className="sm:hidden">Add</span>
                      <span className="hidden sm:inline">Add restroom</span>
                    </Link>
                  </nav>
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
