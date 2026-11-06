// No image publication or deployment. Build using only verified local inputs.
import { mkdtemp, cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import console from "node:console";
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  BETTER_AUTH_URL: "https://vps-build.invalid",
  DATABASE_URL:
    "postgresql://canary:" +
    randomBytes(32).toString("hex") +
    "@invalid.example/build",
};
for (const key of [
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
])
  env[key] = "vps-canary-" + randomBytes(32).toString("hex");
for (const [command, args] of [
  ["npm", ["run", "build"]],
  ["npm", ["run", "check:runtime"]],
]) {
  const r = spawnSync(command, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw Error("VPS artifact preparation failed");
}
const root = await mkdtemp("/tmp/campus-vps-context-");
await mkdir(path.join(root, "runtime"));
await mkdir(path.join(root, "tools/payload"), { recursive: true });
await cp(
  (await readFile(".runtime-evidence/runtime-root.txt", "utf8")).trim(),
  path.join(root, "runtime/app"),
  { recursive: true, verbatimSymlinks: true },
);
for (const file of ["Dockerfile", "image-check.mjs", "cleanup-client.mjs"])
  await cp("ops/vps/" + file, path.join(root, "runtime", file));
await cp("ops/vps/Dockerfile.tools", path.join(root, "tools/Dockerfile"));
for (const file of [
  "node_modules",
  "package.json",
  "package-lock.json",
  "prisma",
  "prisma.config.ts",
  "src/generated",
  "src/lib/schedule-time.ts",
]) {
  await mkdir(path.dirname(path.join(root, "tools/payload", file)), {
    recursive: true,
  });
  await cp(file, path.join(root, "tools/payload", file), {
    recursive: true,
    verbatimSymlinks: true,
  });
}
await mkdir(path.join(root, "tools/payload/scripts"));
await cp(
  "scripts/launch-db-policy.mjs",
  path.join(root, "tools/payload/scripts/launch-db-policy.mjs"),
);
await mkdir(path.join(root, "tools/payload/ops/vps"), { recursive: true });
await cp(
  "ops/vps/admin.mjs",
  path.join(root, "tools/payload/ops/vps/admin.mjs"),
);
await writeFile(".runtime-evidence/vps-context.txt", root);
console.log(
  "PASS isolated Docker contexts ready; no checkout secrets or deployment requested",
);
