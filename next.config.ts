import type { NextConfig } from "next";

type ChurchLogoRemotePattern = Readonly<{
  protocol: "http" | "https";
  hostname: string;
  port: string;
  pathname: string;
}>;

const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export function createChurchLogoRemotePattern(
  supabaseUrl: string | undefined,
): ChurchLogoRemotePattern | null {
  if (!supabaseUrl) return null;

  try {
    const url = new URL(supabaseUrl);
    const isLocalHttp =
      url.protocol === "http:" && LOCAL_SUPABASE_HOSTS.has(url.hostname);
    const isHttps = url.protocol === "https:";

    if (
      (!isHttps && !isLocalHttp) ||
      url.username ||
      url.password ||
      url.hostname.includes("*") ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }

    return {
      protocol: isHttps ? "https" : "http",
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/church-logos/**",
    };
  } catch {
    return null;
  }
}

const churchLogoRemotePattern = createChurchLogoRemotePattern(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: churchLogoRemotePattern ? [churchLogoRemotePattern] : [],
  },
};

export default nextConfig;
