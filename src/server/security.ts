import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { db } from "./db";
import { auth } from "./auth";
import { Denied } from "./errors";
export { Denied, failure } from "./errors";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !process.env.BETTER_AUTH_URL ||
    origin !== new URL(process.env.BETTER_AUTH_URL).origin
  )
    throw new Denied();
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Denied(415);
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    throw new Denied(413);
}
// Only enable a header that an isolated ingress OVERWRITES on every request.
// Never infer trust from the presence of X-Forwarded-For or a request Host.
export function requestSource(request: Request) {
  const header = process.env.AUTH_TRUSTED_IP_HEADER;
  if (!header) {
    const host = new URL(process.env.BETTER_AUTH_URL!).hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return "local-demo";
    throw new Denied(503);
  }
  const value = request.headers.get(header)?.trim() ?? "";
  if (!isIP(value)) throw new Denied(503); // No lists, missing-IP fallback or shared bucket.
  if (isIP(value) === 4) return value;
  // URL canonicalizes equivalent IPv6 spellings. Map IPv4-mapped IPv6 to IPv4.
  const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
  if (mapped) {
    const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
    return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
  }
  return canonical;
}

// Bounded indexed batches; concurrent callers do not wait on the same expired rows.
// Run even for rejected attempts. No traffic means no new buckets to accumulate.
export async function cleanupRateBuckets(now = new Date()) {
  const rows = await db.$queryRaw<{ removed: bigint }[]>`
    WITH expired AS (
      SELECT "key" FROM "RateBucket" WHERE "expiresAt" <= ${now}
      ORDER BY "expiresAt", "key" LIMIT 100 FOR UPDATE SKIP LOCKED
    ), removed AS (
      DELETE FROM "RateBucket" USING expired
      WHERE "RateBucket"."key" = expired."key" RETURNING 1
    ), legacy AS (
      SELECT "id" FROM "RateLimit" WHERE "lastRequest" < ${BigInt(now.getTime() - 15 * 60000)}
      ORDER BY "lastRequest", "id" LIMIT 100 FOR UPDATE SKIP LOCKED
    ), removed_legacy AS (
      DELETE FROM "RateLimit" USING legacy
      WHERE "RateLimit"."id" = legacy."id" RETURNING 1
    ) SELECT (SELECT count(*) FROM removed) + (SELECT count(*) FROM removed_legacy) AS removed
  `;
  return Number(rows[0].removed);
}

export async function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  await cleanupRateBuckets(new Date(now));
  const window = Math.floor(now / windowMs);
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Denied(503);
  const id =
    createHmac("sha256", secret).update(key).digest("hex") + ":" + window;
  const row = await db.rateBucket.upsert({
    where: { key: id },
    create: { key: id, expiresAt: new Date((window + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max) throw new Denied(429);
}
export async function actor(headers: Headers) {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!session) throw new Denied(401);
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      memberships: {
        include: {
          university: true,
          profile: true,
          enrollments: {
            where: { endedAt: null, revokedAt: null },
            include: {
              group: { include: { program: { include: { faculty: true } } } },
            },
          },
          requests: {
            take: 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            include: { targetGroup: true },
          },
        },
      },
    },
  });
  if (!user?.active || user.memberships.length !== 1) throw new Denied();
  const membership = user.memberships[0];
  if (!membership.university.active) throw new Denied();
  return { user, membership, sessionId: session.session.id };
}
export function staff(a: Awaited<ReturnType<typeof actor>>) {
  if (a.membership.role !== "STAFF" || a.membership.status !== "APPROVED")
    throw new Denied();
}
export function studentAccess(a: Awaited<ReturnType<typeof actor>>) {
  if (
    a.membership.role !== "STUDENT" ||
    a.membership.status !== "APPROVED" ||
    a.membership.enrollments.length !== 1 ||
    !a.membership.enrollments[0].group.active ||
    !a.membership.enrollments[0].group.program.active ||
    !a.membership.enrollments[0].group.program.faculty.active ||
    a.membership.enrollments[0].group.program.faculty.universityId !==
      a.membership.universityId
  )
    throw new Denied();
  return a.membership.enrollments[0];
}
export async function readJSON(request: Request, max = 16384) {
  const reader = request.body?.getReader();
  if (!reader) throw new Denied(400);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Denied(413);
    }
    parts.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  return JSON.parse(new TextDecoder().decode(data));
}
