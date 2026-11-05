// Trusted maintenance command, not a public API or part of the standalone runtime.
import pg from "pg";
import process from "node:process";
import console from "node:console";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});
await client.connect();
try {
  let total = 0;
  for (let batch = 0; batch < 100; batch++) {
    const { rows } = await client.query(`
      WITH expired AS (
        SELECT "key" FROM "RateBucket" WHERE "expiresAt" <= CURRENT_TIMESTAMP
        ORDER BY "expiresAt", "key" LIMIT 100 FOR UPDATE SKIP LOCKED
      ), removed AS (
        DELETE FROM "RateBucket" USING expired
        WHERE "RateBucket"."key" = expired."key" RETURNING 1
      ), legacy AS (
        SELECT "id" FROM "RateLimit"
        WHERE "lastRequest" < EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - INTERVAL '15 minutes')) * 1000
        ORDER BY "lastRequest", "id" LIMIT 100 FOR UPDATE SKIP LOCKED
      ), removed_legacy AS (
        DELETE FROM "RateLimit" USING legacy
        WHERE "RateLimit"."id" = legacy."id" RETURNING 1
      ) SELECT (SELECT count(*) FROM removed) + (SELECT count(*) FROM removed_legacy) AS removed
    `);
    const removed = Number(rows[0].removed);
    total += removed;
    if (!removed) break;
  }
  console.log(
    `Expired rate counters removed: ${total} (bounded maintenance run)`,
  );
} finally {
  await client.end();
}
