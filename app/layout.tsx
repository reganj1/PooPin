import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Poopin",
  description: "Discover and rate Bay Area public restrooms based on smell, cleanliness, and access friction."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";

  return (
    <html lang="en">
      <body className={`${manrope.className} antialiased`}>
        <PostHogProvider posthogKey={posthogKey} posthogHost={posthogHost}>
          <div className="min-h-screen">
            <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
              <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="inline-flex items-center gap-2.5 text-slate-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold tracking-wide text-white">
                    WC
                  </span>
                  <span className="text-xl font-semibold tracking-tight">Poopin</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Bay Area beta
                  </span>
                </Link>
                <nav className="flex items-center gap-2 text-sm font-medium">
                  <Link
                    href="/contact"
                    className="rounded-lg px-3 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Contact
                  </Link>
                  <Link
                    href="/add"
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-white transition hover:bg-slate-800"
                  >
                    Add restroom
                  </Link>
                </nav>
              </div>
            </header>
            {children}
          </div>
        </PostHogProvider>
      </body>
    </html>
  );
}
