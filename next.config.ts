import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Passports and statements can be a few MB.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
