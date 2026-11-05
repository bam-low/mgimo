import type { NextConfig } from "next";
import { WebpackRuntimeGraphPlugin } from "./scripts/webpack-runtime-graph";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  ...(process.env.CAMPUS_VERCEL_BUILD === "1"
    ? ({
        webpack(config, { isServer }) {
          if (isServer) config.plugins.push(new WebpackRuntimeGraphPlugin());
          return config;
        },
      } satisfies Partial<NextConfig>)
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
