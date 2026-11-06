const { fetch, AbortSignal } = globalThis;
import process from "node:process";
import console from "node:console";
import { readFile } from "node:fs/promises";
try {
  const secret = (await readFile("/run/secrets/cron", "utf8")).trim();
  if (secret.length < 32) throw Error("Secret unavailable");
  const r = await fetch("http://app:3000/api/internal/rate-cleanup", {
    headers: { authorization: "Bearer " + secret },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("Cleanup refused");
  console.log("PASS bounded internal cleanup");
} catch {
  console.error("FAIL internal cleanup; inspect service status privately");
  process.exitCode = 1;
}
