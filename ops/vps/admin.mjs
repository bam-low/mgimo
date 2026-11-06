import process from "node:process";
import console from "node:console";
// Owner-only, separate tools image. No automatic action on container start.
import pg from "pg";
import { URL } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes, pbkdf2Sync, createHmac, createHash } from "node:crypto";
import {
  grantRuntimePrivileges,
  checkRuntimePrivileges,
} from "../../scripts/launch-db-policy.mjs";
function verifier(pw) {
  const salt = randomBytes(16),
    v = pbkdf2Sync(pw, salt, 4096, 32, "sha256");
  const key = createHmac("sha256", v).update("Client Key").digest();
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${createHash("sha256").update(key).digest("base64")}:${createHmac("sha256", v).update("Server Key").digest("base64")}`;
}
function connection(value) {
  const u = new URL(value);
  if (
    u.hostname !== "db" ||
    u.pathname !== "/campus" ||
    u.searchParams.get("sslmode") !== "verify-full" ||
    u.searchParams.get("sslrootcert") !== "/run/secrets/db-ca.pem" ||
    [...u.searchParams.keys()].length !== 2
  )
    throw Error("Private verified TLS DB required");
  return value;
}
async function connect(value) {
  const c = new pg.Client({
    connectionString: connection(value),
    connectionTimeoutMillis: 10000,
  });
  await c.connect();
  if (!c.connection.stream.authorized) throw Error("TLS not authorized");
  return c;
}
let client;
try {
  const action = process.argv[2];
  if (
    process.argv[3] !== "--owner-approved" ||
    !["bootstrap", "migrate", "seed", "grant", "check"].includes(action)
  )
    throw Error("Explicit owner action required");
  process.loadEnvFile(
    "/run/secrets/" +
      (action === "bootstrap"
        ? "bootstrap.env"
        : action === "check"
          ? "runtime-db.env"
          : "migration.env"),
  );
  if (action === "bootstrap") {
    client = await connect(process.env.ADMIN_DATABASE_URL);
    for (const [role, pw] of [
      ["campus_migrator", process.env.MIGRATOR_PASSWORD],
      ["campus_runtime", process.env.RUNTIME_PASSWORD],
    ]) {
      if (!/^[a-f0-9]{64}$/.test(pw ?? ""))
        throw Error("Private role password required");
      const r = await client.query(
        "SELECT rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (r.rowCount === 0)
        await client.query(
          `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT ${role === "campus_runtime" ? 12 : 4} PASSWORD '${verifier(pw)}'`,
        );
      else if (Object.values(r.rows[0]).some(Boolean))
        throw Error("Existing role attributes unsafe");
      const u = new URL(process.env.ADMIN_DATABASE_URL);
      u.username = role;
      u.password = pw;
      const probe = await connect(u.href);
      await probe.end(); // repeat verifies, never resets password
    }
    const owner = (
      await client.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0].owner;
    if (!["campus_admin", "campus_migrator"].includes(owner))
      throw Error("Unexpected database owner");
    if (owner === "campus_admin")
      await client.query("ALTER DATABASE campus OWNER TO campus_migrator");
  } else if (action === "grant" || action === "check") {
    client = await connect(process.env.DATABASE_URL);
    if (action === "grant") await grantRuntimePrivileges(client);
    else {
      await client.query("BEGIN READ ONLY");
      await checkRuntimePrivileges(client);
      await client.query("ROLLBACK");
    }
  } else {
    connection(process.env.DATABASE_URL);
    const args =
      action === "migrate"
        ? ["node_modules/prisma/build/index.js", "migrate", "deploy"]
        : ["prisma/seed.mjs"];
    // Capture errors privately: never forward a child env/connection URL to CI logs.
    const r = spawnSync(process.execPath, args, {
      env: process.env,
      encoding: "utf8",
    });
    if (r.status !== 0) throw Error("Owner operation failed");
  }
  console.log("PASS owner DB " + action + "; no credentials printed");
} catch {
  console.error(
    "STOP owner DB operation failed; do not start/publish app. Inspect private configuration.",
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
