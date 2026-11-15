// Opt-in hosted CI scratch ownership; local development retains its fixtures.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
export function disk(...args) {
  if (process.env.CAMPUS_CI_DISK_CLEANUP !== "1") return;
  execFileSync(
    "python3",
    [fileURLToPath(new URL("./vps-ci-disk.py", import.meta.url)), ...args],
    { stdio: "inherit" },
  );
}
