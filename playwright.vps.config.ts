import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./tests/e2e/session-cache.ts",
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "https://localhost:18443",
    trace: "off",
    ignoreHTTPSErrors: true,
    httpCredentials: {
      username: "owner",
      password: process.env.CAMPUS_VPS_GATE_PASSWORD ?? "",
    },
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
});
