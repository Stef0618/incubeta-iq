import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavyweight native/server packages out of the bundler.
  serverExternalPackages: ["pdf-parse", "mammoth", "googleapis"],
};

export default nextConfig;
