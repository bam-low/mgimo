-- Existing transient counters have no expiry. Their longest former window was
-- 15 minutes; preserve that protection for at most 15 minutes after migration.
ALTER TABLE "RateBucket" ADD COLUMN "expiresAt" TIMESTAMP(3)
  NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes');
ALTER TABLE "RateBucket" ALTER COLUMN "expiresAt" DROP DEFAULT;
CREATE INDEX "RateBucket_expiresAt_key_idx" ON "RateBucket"("expiresAt", "key");
-- Better Auth's old IP limiter is no longer written; clean its expired rows too.
CREATE INDEX "RateLimit_lastRequest_id_idx" ON "RateLimit"("lastRequest", "id");
