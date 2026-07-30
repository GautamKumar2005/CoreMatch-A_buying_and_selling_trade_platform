import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Generate a static export (out/) so Docker can serve it via Express
  output: "export",
  // Disable image optimization for static export compatibility
  images: { unoptimized: true },
  // Only proxy /api/* to the backend if the URL is known at build time.
  // In production the frontend calls the backend directly via NEXT_PUBLIC_API_URL
  // set in the axios client (lib/api.ts), so the rewrite is optional.
  ...(API_URL
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${API_URL}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
