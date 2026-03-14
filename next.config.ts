import type { NextConfig } from "next";

interface SupabaseRemotePattern {
  protocol: "https" | "http";
  hostname: string;
  port?: string;
  pathname: string;
}

const resolveSupabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;

const createSupabaseRemotePatterns = (): SupabaseRemotePattern[] => {
  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) {
    return [];
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    const protocol: SupabaseRemotePattern["protocol"] | null =
      parsedUrl.protocol === "https:" ? "https" : parsedUrl.protocol === "http:" ? "http" : null;
    if (!protocol) {
      return [];
    }

    return [
      {
        protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || "",
        pathname: "/storage/v1/object/**"
      },
      {
        protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || "",
        pathname: "/storage/v1/render/image/**"
      }
    ];
  } catch {
    return [];
  }
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: createSupabaseRemotePatterns() as NonNullable<NextConfig["images"]>["remotePatterns"]
  }
};

export default nextConfig;
