import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
