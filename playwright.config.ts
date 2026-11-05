import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    trace: "off",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "node scripts/start-test-runtime.mjs",
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
