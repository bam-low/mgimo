import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import console from "node:console";
const root = (
  await readFile(".runtime-evidence/vercel-root.txt", "utf8")
).trim();
const manifest = JSON.parse(
  await readFile(".runtime-evidence/vercel-manifest.json", "utf8"),
);
const reports = manifest.reports;
const rows = (await readFile(".runtime-evidence/vercel-loads.jsonl", "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((s) => JSON.parse(s));
if (!rows.length) throw Error("No Vercel runtime observations");
for (const row of rows) {
  if (
    row.failure ||
    !row.file ||
    !row.file.startsWith(row.root + path.sep) ||
    !row.root.startsWith(root + path.sep)
  )
    throw Error("Runtime failure or artifact escape");
  if (
    !reports[path.relative(root, row.root)]?.files.includes(
      path.relative(row.root, row.file),
    )
  )
    throw Error("Loaded file absent from verified manifest");
  if (!(await realpath(row.file)).startsWith(row.root + path.sep))
    throw Error("Runtime realpath escape");
}
for (const relative of Object.keys(reports))
  if (!rows.some((r) => r.root === path.join(root, relative)))
    throw Error("A function was not loaded");
for (const [file, hash] of Object.entries(manifest.hashes))
  if (
    createHash("sha256")
      .update(await readFile(path.join(root, file)))
      .digest("hex") !== hash
  )
    throw Error("Verified artifact changed during execution");
console.log(
  `PASS ${new Set(rows.map((r) => r.file)).size} observed Vercel CJS/ESM resolutions in ${Object.keys(reports).length} isolated functions; no external fallback/failures. Executed paths only.`,
);
