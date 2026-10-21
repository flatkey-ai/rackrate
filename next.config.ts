import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./data/offers.json"],
  },
  poweredByHeader: false,
};

export default nextConfig;
