import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests",
  testMatch: ["e2e/*.spec.ts", "vercel-e2e/*.spec.ts"],
  webServer: {
    command: "node scripts/start-vercel-test-runtime.mjs",
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    reuseExistingServer: false,
  },
  outputDir: "test-results-vercel",
});
