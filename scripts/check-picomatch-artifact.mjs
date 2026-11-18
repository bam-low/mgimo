import { URL } from "node:url";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const manifest = JSON.parse(await readFile(new URL("../vendor/picomatch-patches.json", import.meta.url), "utf8"));
const root = path.resolve(process.argv[2] || ".");
const hash = data => createHash("sha256").update(data).digest("hex");
const modules = [];
const bundles = [];
const parserSources = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name)) {
      if (/POSIX_REGEX_SOURCE|QMARK_NO_DOT/.test(await readFile(file, "utf8"))) parserSources.push(file);
    } else if (entry.isFile() && entry.name === "package.json") {
      const meta = JSON.parse(await readFile(file, "utf8"));
      if (meta.name === "picomatch") throw Error(`Неисправленная копия picomatch: ${file}`);
      const match = /^@campus\/picomatch-v(2|4)$/.exec(meta.name || "");
      if (match) {
        const dir = path.dirname(file);
        for (const [relative, expected] of Object.entries(manifest.vendors[match[1]])) {
          if (relative !== "index.js" && !relative.startsWith("lib/")) continue;
          if (hash(await readFile(path.join(dir, relative))) !== expected) throw Error(`Неверный код форка: ${dir}/${relative}`);
        }
        modules.push({ path: path.relative(root, dir), version: meta.version, entry: path.join(dir, "index.js") });
      }
    }
  }
}
await walk(path.join(root, "node_modules"));
const knownSources = new Set(modules.flatMap(module => ["lib/constants.js", "lib/parse.js"].map(file => path.join(root, module.path, file))));
for (const file of parserSources) if (!knownSources.has(file)) throw Error(`Непроверенная встроенная копия picomatch: ${file}`);
for (const [relative, spec] of Object.entries(manifest.bundles)) {
  const file = path.join(root, "node_modules", relative);
  try { await stat(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  if (hash(await readFile(file)) !== spec.patchedSHA256) throw Error(`Неисправленная встроенная копия: ${relative}`);
  bundles.push({ path: relative, sha256: spec.patchedSHA256 });
}
const next = path.join(root, "node_modules/next/dist/compiled/picomatch/index.js");
if (!bundles.some(file => file.path === "next/dist/compiled/picomatch/index.js") || modules.length === 0) throw Error("Отсутствует обязательная исправленная копия Next/picomatch");
const probe = String.raw`
const assert = require('node:assert/strict');
const pm = require(process.argv[1]);
const options = [{}, { maxExtglobRecursion: false }, { fastpaths: false }, { capture: true }, { contains: true }, { nobrace: true }, { unescape: true }, { regex: true }, { bash: true }, { nocase: true }, { windows: true }, { flags: 'iu' }];
const patterns = ['+(*a)', '+(*)b', '+(!(a))', '+(@(*a))', '+(a*(a))', '@(*a)+', '(a+)+b', '+(a|aa)', '*(a|aa)b', '+(*a){2,}', '+(*a)\\+', '+(a*a)b', '+([aA]*)b'];
let rejected = 0, evaluated = 0;
for (const opts of options) for (const pattern of patterns) for (const entry of ['makeRe', 'matcher', 'parsed']) {
 try {
  const matcher = entry === 'matcher' ? pm(pattern, opts) : entry === 'parsed' ? pm.compileRe(pm.parse(pattern, opts), opts) : pm.makeRe(pattern, opts);
  for (const n of [24, 128, 1024]) { const value = 'a'.repeat(n) + '!'; if (typeof matcher === 'function') matcher(value); else matcher.test(value); }
  evaluated++;
 } catch (error) { if (!(error instanceof SyntaxError)) throw error; rejected++; }
}
assert.equal(pm('**/*.js')('src/a.js'), true);
assert.equal(pm('[!x].js')('x.js'), true);
assert.equal(pm('**.js')('src/a.js'), true);
assert.equal(pm('+(foo|bar).js')('foobar.js'), true);
assert.equal(pm('src/**/a?.{js,ts}')('src/deep/a1.ts'), true);
process.stdout.write(JSON.stringify({evaluated,rejected}));
`;
const probes = [];
for (const [entry, major] of [...modules.map(module => [module.entry, module.version[0]]), [next, "2"]]) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", probe, entry, major], {
    timeout: 5000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 128 * 1024,
    env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
  });
  if (result.error || result.status !== 0) throw Error(`Ошибка или превышение времени security probe ${entry}: ${result.error?.code || result.stderr}`);
  probes.push({ path: path.relative(root, entry), ...JSON.parse(result.stdout) });
}
// Ensure the adapter really resolves the fork from the delivered tree.
const require = createRequire(next);
if (!require.resolve("@campus/picomatch-v2").startsWith(root + path.sep)) throw Error("Fork resolves outside artifact");
process.stdout.write(JSON.stringify({ advisory: manifest.advisory, modules: modules.map(({ path, version }) => ({ path, version })), bundles, probes }, null, 2) + "\n");
