import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Poopin",
  description: "Discover and rate public restrooms based on smell, cleanliness, and access friction."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.className}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
                Poopin
              </Link>
              <nav className="flex items-center gap-2 text-sm font-medium">
                <Link
                  href="/"
                  className="rounded-md px-3 py-1.5 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Explore
                </Link>
                <Link
                  href="/add"
                  className="rounded-md bg-brand-500 px-3 py-1.5 text-white transition hover:bg-brand-600"
                >
                  Add restroom
                </Link>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
