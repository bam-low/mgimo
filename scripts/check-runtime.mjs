import { Buffer } from "node:buffer";
import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  mkdtemp,
  cp,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import console from "node:console";
const root = process.argv[2] ?? ".next/standalone";
const banned =
  /(?:@visx|@prisma\/studio|node_modules\/prisma(?:\/|$)|\.bin\/prisma|(?:^|\/)scripts\/launch-[^/]+\.mjs|(?:^|\/)[^/]+\.env(?:\.[^/]*)?$)/;
async function files(directory, allowedRoot) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink() && allowedRoot) {
      const target = await realpath(file);
      if (!target.startsWith(allowedRoot + path.sep))
        throw Error("Artifact symlink escapes runtime: " + file);
    }
    if (entry.isDirectory()) result.push(...(await files(file, allowedRoot)));
    else result.push(file);
  }
  return result;
}
const manifest = await files(root, path.resolve(root));
const bad = manifest.filter(
  (file) => banned.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file),
);
if (bad.length)
  throw Error("Forbidden runtime files/traces: environment file or tool");
const secretValues = [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "CRON_SECRET",
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
  "CAMPUS_RUNTIME_PASSWORD",
  "VERCEL_TOKEN",
]
  .map((key) => process.env[key])
  .filter((value) => value && value.length >= 12);
for (const file of manifest) {
  // Directory aliases are containment-checked above; their real target tree is
  // also traversed as ordinary directories. Only files have byte contents.
  if ((await stat(file)).isDirectory()) continue;
  const bytes = await readFile(file);
  for (const secret of secretValues)
    if (
      [
        secret,
        Buffer.from(secret).toString("base64"),
        encodeURIComponent(secret),
      ].some((value) => bytes.includes(Buffer.from(value)))
    )
      throw Error("Build-time secret leaked into standalone artifact");
}
for (const dir of [".next/server", ".next/static"]) {
  for (const file of await files(dir)) {
    if (file.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(file, "utf8"));
      for (const reference of trace.files ?? [])
        if (banned.test(reference)) bad.push(file + ": " + reference);
    } else if (file.endsWith(".js")) {
      const bytes = await readFile(file);
      if (
        secretValues.some((secret) =>
          [
            secret,
            Buffer.from(secret).toString("base64"),
            encodeURIComponent(secret),
          ].some((value) => bytes.includes(Buffer.from(value))),
        )
      )
        throw Error("Build-time secret leaked into static/server output");
      if (
        /@visx\/|@prisma\/studio-core|prisma\/build\/index/.test(
          await readFile(file, "utf8"),
        )
      )
        bad.push(file);
    }
  }
}
if (bad.length)
  throw Error("Forbidden runtime files/traces: " + bad.join("\n"));
await mkdir(".runtime-evidence", { recursive: true });
await writeFile(".runtime-evidence/files.txt", manifest.join("\n") + "\n");
// Preserve relative Next alias symlinks; default fs.cp rewrites them to source paths.
const isolated = await mkdtemp(path.join(tmpdir(), "campus-runtime-"));
await cp(root, isolated, { recursive: true, verbatimSymlinks: true });
await files(isolated, path.resolve(isolated));
await writeFile(".runtime-evidence/runtime-root.txt", isolated + "\n");
await writeFile(".runtime-evidence/runtime-requires.txt", "");
console.log(
  `PASS ${manifest.length} standalone files, relative symlinks, traces/bundle markers; no Prisma CLI/Studio/@visx. Isolated copy prepared.`,
);
