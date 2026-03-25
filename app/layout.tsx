import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { NavigationHistoryTracker } from "@/components/navigation/NavigationHistoryTracker";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocationTrackingProvider } from "@/components/providers/LocationTrackingProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { isAuthConfigured } from "@/lib/auth/config";
import { getAuthenticatedProfile } from "@/lib/auth/server";
import { getSessionUserDisplayName } from "@/lib/auth/sessionUser";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Poopin",
  description: "Discover and rate California public restrooms based on smell, cleanliness, and access friction.",
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
      <body className={`${manrope.className} overflow-x-hidden bg-slate-50 antialiased`}>
        <PostHogProvider posthogKey={posthogKey} posthogHost={posthogHost}>
          <LocationTrackingProvider>
            <div className="min-h-screen">
              <NavigationHistoryTracker />
              <SiteHeader isAuthConfigured={isAuthConfigured} viewerDisplayName={viewerDisplayName} />
              {children}
            </div>
          </LocationTrackingProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
