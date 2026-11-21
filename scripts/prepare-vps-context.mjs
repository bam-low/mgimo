import { disk } from "./vps-ci-lifecycle.mjs";
// No image publication or deployment. Build using only verified local inputs.
import { mkdtemp, cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import console from "node:console";
if (process.arch !== "x64") throw Error("VPS security inputs require amd64");
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
disk("register-path", "candidate-context", root);
disk(
  "register-path",
  "candidate-runtime",
  (await readFile(".runtime-evidence/runtime-root.txt", "utf8")).trim(),
);
await mkdir(path.join(root, "runtime"));
await mkdir(path.join(root, "tools/payload"), { recursive: true });
await mkdir(path.join(root, "database/security"), { recursive: true });
await cp("ops/vps/Dockerfile.db", path.join(root, "database/Dockerfile"));
// Official Alpine v3.24 packages. Signatures are also checked by apk at install.
for (const [name, version, checksum] of [
  [
    "zlib",
    "1.4-r0",
    "7b05bc778b8b25cd880835b40114182bd4d1581717504d0129c810c0a14291cb",
  ],
  [
    "krb5-libs",
    "1.22.3-r0",
    "fad5b46a953e6a37a1bb61a84538fa08ecb6a07816f439eb06f2735aebfcbfbf",
  ],
  [
    "libxslt",
    "1.1.43-r4",
    "40e6cc7d09ce1e69421c2b37e1da4e9afef486843f21c3a79339cd6d93c1c617",
  ],
  // CVE-2026-86144 (HIGH, исправлено в 2.13.9-r3), найдено Trivy при выпуске 21.11.2026.
  [
    "libxml2",
    "2.13.9-r3",
    "8b37229c4761cf0eef5089045283526ef43bf335073050515010d34a313186ed",
  ],
]) {
  const destination = path.join(root, `database/security/${name}.apk`);
  const fetched = spawnSync(
    "curl",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--proto",
      "=https",
      `https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/${name}-${version}.apk`,
      "-o",
      destination,
    ],
    { stdio: "inherit" },
  );
  if (
    fetched.status !== 0 ||
    createHash("sha256")
      .update(await readFile(destination))
      .digest("hex") !== checksum
  )
    throw Error(
      "Verified Alpine security package unavailable or checksum mismatch",
    );
}
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
for (const name of ["admin.mjs", "tools-check.mjs"]) {
  await cp("ops/vps/" + name, path.join(root, "tools/payload/ops/vps", name));
}
await writeFile(".runtime-evidence/vps-context.txt", root);
console.log(
  "PASS isolated Docker contexts ready; no checkout secrets or deployment requested",
);
