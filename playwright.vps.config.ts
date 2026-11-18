import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./tests/e2e/session-cache.ts",
  testDir: "tests/e2e",
  // These two new Issue #62 capabilities do not exist in the frozen old app.
  // Candidate runs execute every test; historical runs keep all old scenarios.
  testIgnore: process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1"
    ? ["**/teaching-assignments.spec.ts", "**/schedule-grades-link.spec.ts"]
    : [],
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
