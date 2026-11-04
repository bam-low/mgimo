import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  mkdtemp,
  cp,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import console from "node:console";
const root = process.argv[2] ?? ".next/standalone";
const banned =
  /(?:@visx|@prisma\/studio|node_modules\/prisma(?:\/|$)|\.bin\/prisma)/;
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
const bad = manifest.filter((file) => banned.test(file));
for (const dir of [".next/server", ".next/static"]) {
  for (const file of await files(dir)) {
    if (file.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(file, "utf8"));
      for (const reference of trace.files ?? [])
        if (banned.test(reference)) bad.push(file + ": " + reference);
    } else if (file.endsWith(".js")) {
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
