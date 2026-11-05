import { spawnSync } from "node:child_process";
import process from "node:process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import {
  inspectFunction,
  inspectBundledGraph,
  walk,
} from "../scripts/vercel-artifact.mjs";
async function fixture(run) {
  const root = await mkdtemp("/tmp/campus-checker-test-");
  const config = {
    runtime: "nodejs24.x",
    handler: "___next_launcher.cjs",
    environment: {},
  };
  await writeFile(path.join(root, ".vc-config.json"), JSON.stringify(config));
  await writeFile(
    path.join(root, "___next_launcher.cjs"),
    'const conf = {"env":{}};\nmodule.exports=()=>conf;\n',
  );
  try {
    await run(root, config);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const lock = { packages: {} };
test("accepts a self-contained Node24 fixture and produces dependency evidence", () =>
  fixture(async (root) => {
    const result = await inspectFunction(root, lock);
    assert(result.graph.includes("___next_launcher.cjs"));
  }));
test("rejects dev tools, Studio/alpha packages and test/env files", async () => {
  for (const file of [
    "node_modules/prisma/build/index.js",
    "node_modules/@visx/group/index.js",
    "tests/leak.test.js",
    ".env.local",
    "node_modules/vitest/index.js",
  ])
    await fixture(async (root) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), "bad");
      await assert.rejects(inspectFunction(root, lock));
    });
});
test("rejects a declared dev-only dependency even with an innocuous name", () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "node_modules/innocent"), { recursive: true });
    await writeFile(
      path.join(root, "node_modules/innocent/index.js"),
      "module.exports=1",
    );
    await assert.rejects(
      inspectFunction(root, {
        packages: { "node_modules/innocent": { version: "1.0.0", dev: true } },
      }),
    );
  }));
test("rejects unknown imports instead of ignoring trace warnings", () =>
  fixture(async (root) => {
    await writeFile(
      path.join(root, "___next_launcher.cjs"),
      'const conf = {"env":{}};\nrequire("unknown-runtime-package");\n',
    );
    await assert.rejects(
      inspectFunction(root, lock),
      /Unreviewed trace warning/,
    );
  }));
test("rejects escaping symlinks", () =>
  fixture(async (root) => {
    await symlink("/tmp", path.join(root, "escape"));
    await assert.rejects(walk(root), /escapes/);
  }));
test("rejects filePathMap, environment injection and unknown runtimes", async () => {
  for (const patch of [
    { filePathMap: { secret: "../../secret" } },
    { environment: { TOKEN: "secret" } },
    { runtime: "edge" },
  ])
    await fixture(async (root, config) => {
      await writeFile(
        path.join(root, ".vc-config.json"),
        JSON.stringify({ ...config, ...patch }),
      );
      await assert.rejects(inspectFunction(root, lock));
    });
});
test("rejects build secret canaries in copied or bundled bytes", () =>
  fixture(async (root) => {
    const secret = "fictional-secret-canary-only";
    await writeFile(
      path.join(root, "bundle.js"),
      "module.exports=" + JSON.stringify(secret),
    );
    await assert.rejects(
      inspectFunction(root, lock, [secret]),
      /secret leaked/,
    );
  }));

test("rejects dev-only modules in a server bundle before names can be minified away", () => {
  const lock = {
    packages: { "node_modules/ordinary-tool": { version: "1.0.0", dev: true } },
  };
  assert.throws(() =>
    inspectBundledGraph(
      [
        {
          modules: [
            {
              identifier: "javascript/auto|node_modules/ordinary-tool/index.js",
            },
          ],
        },
      ],
      lock,
    ),
  );
  assert.throws(() => inspectBundledGraph([], lock));
});

test("standalone rejects env files before tracing or packaging", () =>
  fixture(async (root) => {
    await writeFile(path.join(root, ".env.local"), "fictional-only");
    const result = spawnSync(
      process.execPath,
      ["scripts/check-runtime.mjs", root],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert(result.stderr.includes("Forbidden runtime files/traces"));
  }));
test("standalone rejects secret canaries without printing values", () =>
  fixture(async (root) => {
    const secret = "fictional-build-only-standalone-canary";
    await writeFile(path.join(root, "bundle.js"), JSON.stringify(secret));
    const result = spawnSync(
      process.execPath,
      ["scripts/check-runtime.mjs", root],
      { encoding: "utf8", env: { ...process.env, BETTER_AUTH_SECRET: secret } },
    );
    assert.equal(result.status, 1);
    assert(result.stderr.includes("Build-time secret leaked"));
    assert(!result.stderr.includes(secret));
  }));

test("standalone directory aliases cannot conceal secret-bearing files", () =>
  fixture(async (root) => {
    const secret = "fictional-alias-only-build-canary";
    await mkdir(path.join(root, "target"));
    await writeFile(
      path.join(root, "target/bundle.js"),
      JSON.stringify(secret),
    );
    await symlink("target", path.join(root, "alias"));
    const result = spawnSync(
      process.execPath,
      ["scripts/check-runtime.mjs", root],
      { encoding: "utf8", env: { ...process.env, BETTER_AUTH_SECRET: secret } },
    );
    assert.equal(result.status, 1);
    assert(result.stderr.includes("Build-time secret leaked"));
    assert(!result.stderr.includes(secret));
  }));
