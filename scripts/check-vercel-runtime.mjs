import { Buffer } from "node:buffer";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  realpath,
  mkdtemp,
  cp,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import {
  inside,
  inspectFunction,
  inspectBundledGraph,
  walk,
} from "./vercel-artifact.mjs";
const output = path.resolve(".vercel/output");
const config = JSON.parse(
  await readFile(path.join(output, "config.json"), "utf8"),
);
if (config.version !== 3) throw Error("Unknown Vercel output version");
const tool = JSON.parse(
  await readFile(path.join(output, "campus-builder.json"), "utf8"),
);
if (tool.name !== "@vercel/next" || tool.version !== "28.0.1")
  throw Error("Unknown builder provenance");
const functions = path.join(output, "functions");
const required = [
  "index.func",
  "register.func",
  "login.func",
  "cabinet.func",
  "staff.func",
  "_middleware.func",
  "api/internal/rate-cleanup.func",
  "api/register.func",
  "api/structure.func",
  "api/group.func",
  "api/enrollment.func",
  "api/staff/decision.func",
  "api/auth/[...all].func",
];
for (const entry of required) {
  const resolved = await realpath(path.join(functions, entry));
  if (!inside(functions, resolved))
    throw Error("Function alias escapes artifact");
}
// Includes aliases: reject all escapes before making an independent copy.
await walk(output);
const isolated = await mkdtemp("/tmp/campus-vercel-runtime-");
await cp(output, isolated, { recursive: true, verbatimSymlinks: true });
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const secretValues = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
].map((key) => process.env[key]);
secretValues.push(
  ...Object.values(
    JSON.parse(
      await readFile(".runtime-evidence/vercel-canaries.json", "utf8"),
    ),
  ),
);
const bundleModules = inspectBundledGraph(
  JSON.parse(
    await readFile(path.join(output, "campus-module-graph.json"), "utf8"),
  ),
  lock,
);
const reports = {};
async function discover(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const p = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".func"))
        reports[path.relative(isolated, p)] = await inspectFunction(
          p,
          lock,
          secretValues,
        );
      else await discover(p);
    }
  }
}
await discover(path.join(isolated, "functions"));
if (!Object.keys(reports).length) throw Error("No functions verified");
// Scan static output for secret values too. Never put full artifacts or raw env in CI evidence.
for (const file of await walk(isolated)) {
  const bytes = await readFile(file);
  if (
    secretValues.some(
      (s) =>
        s?.length >= 12 &&
        [s, Buffer.from(s).toString("base64"), encodeURIComponent(s)].some(
          (v) => bytes.includes(Buffer.from(v)),
        ),
    )
  )
    throw Error("Secret leaked into static output");
}
await mkdir(".runtime-evidence", { recursive: true });
await writeFile(".runtime-evidence/vercel-root.txt", isolated);
await writeFile(".runtime-evidence/vercel-loads.jsonl", "");
const hashes = {};
for (const file of await walk(isolated))
  hashes[path.relative(isolated, file)] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
await writeFile(
  ".runtime-evidence/vercel-manifest.json",
  JSON.stringify(
    {
      bundleModules,
      tool: "@vercel/next 28.0.1 ABI2 → Build Output API3 / webpack",
      reports,
      hashes,
    },
    null,
    2,
  ),
);
console.log(
  `PASS ${Object.keys(reports).length} real Vercel Node24 functions: files, package/dependency graphs, aliases and secret canaries; isolated copy ready.`,
);
