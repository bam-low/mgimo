import { readFile } from "node:fs/promises";
import path from "node:path";
import console from "node:console";
const entries = (
  await readFile(".runtime-evidence/runtime-requires.txt", "utf8")
)
  .trim()
  .split("\n");
const root =
  (await readFile(".runtime-evidence/runtime-root.txt", "utf8")).trim() +
  path.sep;
const bad = entries.filter(
  (s) =>
    /@visx|@prisma\/studio|node_modules\/prisma\//.test(s) ||
    (path.isAbsolute(s) && !s.startsWith(root)),
);
if (bad.length)
  throw Error(
    "Runtime escaped artifact or loaded CLI/Studio: " + bad.join("\n"),
  );
console.log(
  `PASS ${new Set(entries).size} observed Node CJS/ESM resolutions; no forbidden modules or source node_modules fallback. Coverage is limited to executed E2E routes and supplemented by static traces/files.`,
);
