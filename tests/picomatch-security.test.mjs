import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { verifiedPatch } from "../scripts/picomatch-patches.mjs";

const require = createRequire(import.meta.url);
test("MIT notice сохраняется в трассируемом entrypoint форка", async () => {
  for (const major of [2, 4]) {
    const notice = (await readFile(`vendor/picomatch-v${major}/LICENSE`, "utf8")).trim();
    const entry = await readFile(require.resolve(`@campus/picomatch-v${major}`), "utf8");
    assert.ok(entry.includes(notice), `v${major}: standalone должен содержать полный MIT notice`);
  }
});
test("Изменение upstream bytes или маскировка маркером не обходят fail-closed проверку", async () => {
  const manifest = JSON.parse(await readFile("vendor/picomatch-patches.json", "utf8"));
  const file = "next/dist/compiled/picomatch/index.js";
  const spec = manifest.bundles[file];
  const installed = await readFile("node_modules/" + file, "utf8");
  assert.equal(verifiedPatch(installed, file, spec), installed);
  assert.throws(() => verifiedPatch(installed + "\n", file, spec), /Непроверенная версия/);
  assert.throws(() => verifiedPatch("// Campus security adapter\nmodule.exports = {};", file, spec), /Непроверенная версия/);
});
for (const major of [2, 4]) test(`Обычные glob-сценарии, локальный форк v${major}`, () => {
  const pm = require(`@campus/picomatch-v${major}`);
  for (const [pattern, yes, no, options] of [
    ["**/*.ts", "src/deep/app.ts", "src/app.js"],
    ["**.js", "app.js", "app.ts"],
    ["src/**/*.{js,ts}", "src/app.ts", "test/app.ts"],
    ["[!x].js", "x.js", "a.js"],
    ["[ab].js", "a.js", "z.js"],
    ["!*.test.ts", "app.ts", "app.test.ts"],
    ["+(foo|bar).js", "foobar.js", "baz.js"],
    ["src/**", "src/.env", "test/.env", { dot: true }],
    ["*.JS", "app.js", "app.ts", { nocase: true }],
    ["**/*.js", "src\\app.js", "src\\app.ts", { windows: true }],
  ]) {
    assert.equal(pm(pattern, options)(yes), true, `${pattern}: ${yes}`);
    assert.equal(pm(pattern, options)(no), false, `${pattern}: ${no}`);
    assert.equal(pm.makeRe(pattern, options).test(yes.replaceAll("\\", "/")), true);
  }
  assert.equal(pm(["*.ts", "*.js"], { ignore: "*.test.*" })("app.test.ts"), false);
  assert.deepEqual(pm.scan("src/**/*.ts").base, "src");
  assert.equal(pm("+(a)", { capture: true })("aaa"), true);
  assert.throws(() => pm("+(a*(a))", { maxExtglobRecursion: false }), SyntaxError);
  assert.throws(() => pm("@(*a)+", { maxExtglobRecursion: false }), SyntaxError);
});

test("4995 обычных сопоставлений на версию сохраняют результаты исходных пакетов и Next", async () => {
  const { cases, inputs } = JSON.parse(await readFile("tests/picomatch-ordinary-fixtures.json", "utf8"));
  for (const item of cases) {
    const pm = require(item.name === "next" ? "next/dist/compiled/picomatch" : `@campus/picomatch-${item.name}`);
    assert.deepEqual(inputs.map(input => pm(item.pattern, item.options)(input) ? "1" : "0").join(""), item.expected, JSON.stringify({ name: item.name, pattern: item.pattern, options: item.options }));
  }
});

test("Настоящий поиск файлов через tinyglobby и micromatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "campus-picomatch-files-"));
  try {
    for (const file of ["src/app.ts", "src/app.test.ts", "src/nested/view.tsx", "src/.private.ts", "docs/README.md"]) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), "Вымышленная тестовая фикстура\n");
    }
    const { glob } = require("tinyglobby");
    const result = await glob(["src/**/*.{ts,tsx}"], { cwd: root, ignore: ["**/*.test.ts"] });
    assert.deepEqual(result.sort(), ["src/app.ts", "src/nested/view.tsx"]);
    assert.deepEqual(require("micromatch")(["src/app.ts", "src/app.js", "docs/a.ts"], "src/**/*.ts"), ["src/app.ts"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Все установленные и встроенные копии проверены; ReDoS ограничен отдельным процессом", () => {
  const result = spawnSync(process.execPath, ["scripts/check-picomatch-artifact.mjs", "."], { timeout: 90000, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.bundles.length, 11);
  assert.ok(report.modules.length >= 4);
  assert.ok(report.probes.every(probe => probe.evaluated > 0 && probe.rejected > 0));
});

test("Архивы форков соответствуют SHA-512 в lockfile", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const entry of Object.values(lock.packages)) {
    if (!entry.resolved?.startsWith("file:vendor/picomatch-")) continue;
    const digest = createHash("sha512").update(await readFile(entry.resolved.slice(5))).digest("base64");
    assert.equal(entry.integrity, `sha512-${digest}`);
  }
});
