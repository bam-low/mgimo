import process from "node:process";
import { URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { verifiedPatch } from "./picomatch-patches.mjs";

const manifest = JSON.parse(await readFile(new URL("../vendor/picomatch-patches.json", import.meta.url), "utf8"));
for (const [file, spec] of Object.entries(manifest.bundles)) {
  const target = new URL("../node_modules/" + file, import.meta.url);
  const original = await readFile(target, "utf8");
  const patched = verifiedPatch(original, file, spec);
  if (patched !== original) await writeFile(target, patched);
}
process.stdout.write("Проверенные исправления встроенных зависимостей применены.\n");
