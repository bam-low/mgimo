import { runtimeTestEnv } from "./runtime-test-env.mjs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
const root = (
  await readFile(".runtime-evidence/runtime-root.txt", "utf8")
).trim();
const child = spawn(
  process.execPath,
  ["--import", path.resolve("scripts/runtime-trace.mjs"), "server.js"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...runtimeTestEnv(), HOSTNAME: "127.0.0.1", NODE_PATH: "" },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
