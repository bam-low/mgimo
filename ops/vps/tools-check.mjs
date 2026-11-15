// Build-time/read-only check of the actual native migration payload and vendor inventory.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
assert.equal(process.getuid(), 1000);
for (const file of [
  "/bin/sh",
  "/bin/bash",
  "/usr/bin/apt",
  "/usr/bin/dpkg",
  "/usr/bin/perl",
  "/usr/local/bin/npm",
  "/usr/local/bin/npx",
])
  assert.equal(existsSync(file), false);
const inventory = "/var/lib/dpkg/status.d/";
const files = readdirSync(inventory);
for (const name of [
  "libacl1",
  "libsystemd0",
  "libtinfo6",
  "ncurses-base",
  "ncurses-bin",
  "perl-base",
])
  assert.equal(files.includes(name), false);
for (const name of ["libc6", "libssl3t64", "libzstd1", "zlib1g"])
  assert.match(
    readFileSync(inventory + name, "utf8"),
    new RegExp("Package: " + name + "\\n"),
  );
assert.equal(
  JSON.parse(readFileSync("/tools/node_modules/prisma/package.json", "utf8"))
    .version,
  "7.10.1",
);
const probe = spawnSync(
  "/tools/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x",
  ["--version"],
  { encoding: "utf8" },
);
assert.equal(probe.status, 0);
assert.match(probe.stdout, /^schema-engine-cli /);
console.log(
  "PASS non-root shell-free tools, vendor package inventory and actual native Prisma engine",
);
