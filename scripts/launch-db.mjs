import pg from "pg";
import process from "node:process";
import console from "node:console";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  grantRuntimePrivileges,
  checkRuntimePrivileges,
} from "./launch-db-policy.mjs";
export function launchDatabaseURL(value, grant, env = process.env) {
  const url = new URL(value);
  const local = env.CAMPUS_LAUNCH_LOCAL_TEST === "yes";
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.hash ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw Error("Invalid launch connection");
  if (
    [...url.searchParams.keys()].some(
      (k) => !["sslmode", "channel_binding"].includes(k),
    ) ||
    new Set(url.searchParams.keys()).size !==
      [...url.searchParams.keys()].length ||
    (url.port && url.port !== "5432" && !local)
  )
    throw Error("Unexpected connection override");
  if (local) {
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !url.pathname.endsWith("_test")
    )
      throw Error("Local mode requires loopback *_test DB");
  } else if (
    !url.hostname.endsWith(".neon.tech") ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    (grant && url.hostname.includes("-pooler."))
  )
    throw Error("Neon verified TLS/direct admin connection required");
  if (!grant && decodeURIComponent(url.username) !== "campus_runtime")
    throw Error("Runtime role required");
  if (grant && decodeURIComponent(url.username) === "campus_runtime")
    throw Error("Migration owner required");
  return {
    connectionString: value,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    enableChannelBinding: true,
  };
}
export async function main(args = process.argv.slice(2), env = process.env) {
  let client;
  try {
    const grant = args[0] === "grant";
    if (
      !(args.length === 1 && args[0] === "check") &&
      !(args.join(" ") === "grant --apply --dedicated-synthetic-db")
    )
      throw Error("Explicit grant acknowledgement required");
    client = new pg.Client(
      launchDatabaseURL(
        grant ? env.DIRECT_DATABASE_URL : env.DATABASE_URL,
        grant,
        env,
      ),
    );
    await client.connect();
    if (
      env.CAMPUS_LAUNCH_LOCAL_TEST !== "yes" &&
      (!client.connection.stream.encrypted ||
        !client.connection.stream.authorized)
    )
      throw Error("Verified TLS required");
    if (grant) await grantRuntimePrivileges(client);
    else {
      const { rows } = await client.query("SELECT current_user AS name");
      if (rows[0].name !== "campus_runtime")
        throw Error("Runtime session required");
      await client.query("BEGIN READ ONLY");
      await checkRuntimePrivileges(client);
      await client.query("ROLLBACK");
    }
    console.log(
      "PASS launch DB policy; credentials were not printed. Cloud behavior still requires smoke tests.",
    );
    return 0;
  } catch {
    console.error(
      "STOP launch DB check/grant failed. Do not deploy; inspect the private configuration/schema locally. No credentials printed.",
    );
    return 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  process.exitCode = await main();
