// No account/link/pull/deploy commands. Clean source staging prevents the official
// Next builder from copying .env* files independently of output tracing excludes.
import { mkdir, writeFile, mkdtemp, cp, rm, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import process from "node:process";
import path from "node:path";
const source = process.cwd();
await rm(".vercel/output", { recursive: true, force: true });
const stage = await mkdtemp("/tmp/campus-vercel-build-");
function run(command, args, env) {
  const r = spawnSync(command, args, { cwd: stage, stdio: "inherit", env });
  if (r.status !== 0) throw Error("Offline Vercel build step failed");
}
// Explicit build inputs work in provider checkouts without .git. Env files and
// owner .vercel links are never inputs; unknown future build files require review.
const inputs = [
  "src",
  "prisma",
  "scripts",
  "tests",
  "public",
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".nvmrc",
  "next.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "vitest.config.mts",
  "vitest.integration.config.mts",
  "playwright.config.ts",
  "playwright.vercel.config.ts",
];
for (const relative of inputs) {
  try {
    await access(path.join(source, relative));
  } catch {
    if (relative === "public") continue;
    throw Error("Missing explicit build input: " + relative);
  }
  await cp(path.join(source, relative), path.join(stage, relative), {
    recursive: true,
    verbatimSymlinks: true,
  });
}
const canaries = {};
for (const key of [
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
])
  canaries[key] = "build-canary-" + randomBytes(32).toString("hex");
canaries.DATABASE_URL =
  "postgresql://canary:" +
  randomBytes(24).toString("hex") +
  "@invalid.example/campus_build";
canaries.DIRECT_DATABASE_URL = canaries.DATABASE_URL;
canaries.BETTER_AUTH_URL = "https://campus-build-only.invalid";
const env = {
  ...process.env,
  ...canaries,
  CI: "1",
  VERCEL_TELEMETRY_DISABLED: "1",
  NO_UPDATE_NOTIFIER: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  ALLOW_DEMO_SEED: "",
  NODE_PATH: "",
};
// Never transmit inherited vendor/project tokens to the local CLI.
for (const key of Object.keys(env))
  if (
    /(?:TOKEN|PASSWORD|SECRET|DATABASE_URL|VERCEL_ORG_ID|VERCEL_PROJECT_ID)/.test(
      key,
    ) &&
    !(key in canaries)
  )
    delete env[key];
run("npm", ["ci", "--include=dev", "--ignore-scripts"], env);
run(
  process.execPath,
  [path.join(stage, "scripts/vercel-builder-worker.mjs")],
  env,
);
await mkdir(".vercel", { recursive: true });
await rm(".vercel/output", { recursive: true, force: true });
await cp(path.join(stage, ".vercel/output"), ".vercel/output", {
  recursive: true,
  verbatimSymlinks: true,
});
await mkdir(".runtime-evidence", { recursive: true });
// Private local canaries, not real credentials; never upload this file or full bundles.
await writeFile(
  ".runtime-evidence/vercel-canaries.json",
  JSON.stringify(canaries),
  { mode: 0o600 },
);
