import { randomBytes, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { open, realpath, stat, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import console from "node:console";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export async function writePrivateConfig(output, body, env = process.env) {
  if (!output || !path.isAbsolute(output))
    throw Error("Absolute private path required");
  const parent = await realpath(path.dirname(output));
  const target = path.join(parent, path.basename(output));
  const repo = await realpath(root);
  const lexical = path.resolve(output);
  if (
    target === repo ||
    target.startsWith(repo + path.sep) ||
    lexical.startsWith(repo + path.sep)
  )
    throw Error("Outside checkout only");
  for (let ancestor = parent; ; ancestor = path.dirname(ancestor)) {
    try {
      await lstat(path.join(ancestor, ".git"));
      throw Error("Outside every Git checkout only");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (path.dirname(ancestor) === ancestor) break;
  }
  const info = await stat(parent);
  if (process.platform === "win32") {
    if (env.CAMPUS_PRIVATE_WINDOWS_ACL_CONFIRMED !== "yes")
      throw Error("Private Windows ACL required");
  } else if (info.mode & 0o077)
    throw Error("Private parent directory mode 0700 required");
  const file = await open(target, "wx", 0o600);
  try {
    await file.writeFile(body);
  } finally {
    await file.close();
  }
}
export function generatedOwnerConfig() {
  const keys = [
    "BETTER_AUTH_SECRET",
    "CRON_SECRET",
    "DEMO_STAFF_PASSWORD",
    "DEMO_STUDENT1_PASSWORD",
    "DEMO_STUDENT2_PASSWORD",
    "CAMPUS_RUNTIME_PASSWORD",
  ];
  return (
    "# Private owner file: never put in Git, chat, CI, screenshots or cloud app env.\n" +
    keys.map((k) => k + "=" + randomBytes(32).toString("hex")).join("\n") +
    "\nALLOW_DEMO_SEED=yes\nDIRECT_DATABASE_URL=\nDATABASE_URL=\nCAMPUS_POOLED_HOST=\nBETTER_AUTH_URL=\nVERCEL_TOKEN=\nVERCEL_TEAM_ID=\nCAMPUS_VERCEL_PROJECT_NAME=\nVERCEL_PROJECT_ID=\n"
  );
}
export function neonRootCA() {
  // Export an already trusted public root from the pinned Node distribution;
  // never download/install a new CA or disable hostname/certificate verification.
  const fingerprint =
    "96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6";
  const certificate = rootCertificates.find(
    (c) => new X509Certificate(c).fingerprint256 === fingerprint,
  );
  if (!certificate) throw Error("Expected trusted ISRG Root X1 unavailable");
  return certificate + "\n";
}
export function runtimeConfig(env) {
  const direct = new URL(env.DIRECT_DATABASE_URL);
  const host = env.CAMPUS_POOLED_HOST ?? "";
  const origin = new URL(env.BETTER_AUTH_URL);
  if (
    !["postgres:", "postgresql:"].includes(direct.protocol) ||
    !direct.username ||
    !direct.password ||
    direct.pathname.length < 2 ||
    direct.hash ||
    (direct.port && direct.port !== "5432") ||
    [...direct.searchParams.keys()].some(
      (k) => !["sslmode", "channel_binding"].includes(k),
    ) ||
    new Set(direct.searchParams.keys()).size !==
      [...direct.searchParams.keys()].length ||
    !direct.hostname.endsWith(".neon.tech") ||
    direct.hostname.includes("-pooler.") ||
    direct.searchParams.get("sslmode") !== "verify-full" ||
    !host.includes("-pooler.") ||
    host.replace("-pooler.", ".") !== direct.hostname ||
    !/^[\da-f]{64}$/.test(env.CAMPUS_RUNTIME_PASSWORD ?? "") ||
    !/^[\da-f]{64}$/.test(env.BETTER_AUTH_SECRET ?? "") ||
    !/^[\da-f]{64}$/.test(env.CRON_SECRET ?? "") ||
    new Set([
      env.CAMPUS_RUNTIME_PASSWORD,
      env.BETTER_AUTH_SECRET,
      env.CRON_SECRET,
    ]).size !== 3 ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    ["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw Error("Verified owner inputs required");
  direct.username = "campus_runtime";
  direct.password = env.CAMPUS_RUNTIME_PASSWORD;
  direct.hostname = host;
  // No admin URL, seed passwords, API tokens or direct-role credentials in this file.
  return `DATABASE_URL=${direct.href}\nBETTER_AUTH_SECRET=${env.BETTER_AUTH_SECRET}\nCRON_SECRET=${env.CRON_SECRET}\nBETTER_AUTH_URL=${origin.origin}\nAUTH_TRUSTED_IP_HEADER=x-vercel-forwarded-for\n`;
}
export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    if (
      args.length !== 3 ||
      args[1] !== "--output" ||
      !["init", "runtime", "ca"].includes(args[0])
    )
      throw Error("Usage");
    await writePrivateConfig(
      args[2],
      args[0] === "init"
        ? generatedOwnerConfig()
        : args[0] === "ca"
          ? neonRootCA()
          : runtimeConfig(env),
      env,
    );
    console.log(
      "PASS private configuration created exclusively. Open locally; never share its contents.",
    );
    return 0;
  } catch {
    console.error(
      "STOP private config not created. Check private path/permissions/inputs; existing files are never overwritten.",
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  process.exitCode = await main();
