import type { NextConfig } from "next";
import { nodeFileTrace } from "@vercel/nft";
import { WebpackRuntimeGraphPlugin } from "./scripts/webpack-runtime-graph";

// Worker threads are outside the parent bundle graph. Trace their real runtime
// closure explicitly; directory globs would copy dependency tests/CLI files.
export default async function config(): Promise<NextConfig> {
  const workerTrace = await nodeFileTrace(["src/server/document-worker.mjs"], {
    base: process.cwd(),
  });
  const nextConfig: NextConfig = {
    agentRules: false,
    output: "standalone",
    serverExternalPackages: ["pdf-lib", "sharp", "busboy"],
    outputFileTracingIncludes: {
      "/*": [...workerTrace.fileList].map((file) => "./" + file),
    },
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
            {
              key: "Permissions-Policy",
              value:
                "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
            },
          ],
        },
      ];
    },
  };

  return nextConfig;
}
