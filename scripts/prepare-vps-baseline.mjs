import process from "node:process";
import console from "node:console";
// Build a fixed historical fixture in a disposable archive, never a worktree or deploy.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
const source = "287912fe19df75404b81dd36ea1df5bb62187c71";
execFileSync("git", ["cat-file", "-e", source + "^{commit}"]);
const directory = await mkdtemp(path.join(tmpdir(), "campus-vps-baseline-"));
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete environment[key];
const run = (cmd, args, cwd = directory) =>
  execFileSync(
    cmd,
    cmd === "docker" ? ["--host=unix:///var/run/docker.sock", ...args] : args,
    {
      cwd,
      stdio: "inherit",
      env: environment,
    },
  );
execFileSync("tar", ["-xf", "-", "-C", directory], {
  input: execFileSync("git", ["archive", source], {
    maxBuffer: 100 * 1024 * 1024,
  }),
});
run("npm", ["ci", "--ignore-scripts"]);
run("npm", ["run", "db:generate"]);
run(process.execPath, ["scripts/prepare-vps-context.mjs"]);
const context = (
  await readFile(
    path.join(directory, ".runtime-evidence/vps-context.txt"),
    "utf8",
  )
).trim();
const images = { sourceCommit: source };
for (const [role, subdir] of [
  ["runtime", "runtime"],
  ["tools", "tools"],
  ["db", "database"],
]) {
  const name = "campus54-baseline-" + role;
  run("docker", [
    "build",
    "--network=none",
    "-t",
    name,
    path.join(context, subdir),
  ]);
  images[role] = JSON.parse(
    execFileSync(
      "docker",
      ["--host=unix:///var/run/docker.sock", "image", "inspect", name],
      { env: environment },
    ),
  )[0].Id;
}
await writeFile(
  ".runtime-evidence/vps-baseline.json",
  JSON.stringify(images, null, 2) + "\n",
);
console.log(
  "PASS fixed baseline archive/images prepared; fixture only, not delivered",
);
