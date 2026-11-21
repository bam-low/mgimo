-- Портфолио студента: одна работа = одна запись с одним PDF (до 3 МиБ).
-- Состояния: PRIVATE (только для студента) → PENDING (на модерации) → APPROVED / REJECTED.
CREATE TABLE "PortfolioItem" (
 "id" TEXT PRIMARY KEY,
 "universityId" TEXT NOT NULL,
 "membershipId" TEXT NOT NULL,
 "status" TEXT NOT NULL,
 "category" TEXT NOT NULL,
 "activity" TEXT NOT NULL,
 "eventDate" DATE NOT NULL,
 "title" TEXT NOT NULL,
 "comment" TEXT,
 "format" TEXT NOT NULL,
 "eventType" TEXT NOT NULL,
 "rulesUrl" TEXT,
 "participants" TEXT NOT NULL,
 "eventUrl" TEXT,
 "level" TEXT NOT NULL,
 "organizers" JSONB NOT NULL,
 "byteSize" INTEGER NOT NULL,
 "sha256" TEXT NOT NULL,
 "content" BYTEA NOT NULL,
 "reviewRound" INTEGER NOT NULL DEFAULT 0,
 "reviewerId" TEXT,
 "reviewComment" TEXT,
 "reviewedAt" TIMESTAMPTZ(3),
 "submittedAt" TIMESTAMPTZ(3),
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PortfolioItem_values" CHECK (
  "status" IN ('PRIVATE','PENDING','APPROVED','REJECTED') AND
  "category" IN ('STUDY','RESEARCH','SOCIAL','CULTURE','SPORT') AND
  "activity" IN ('WIN','PRIZE','PARTICIPATION','PUBLICATION','OTHER') AND
  "format" IN ('IN_PERSON','REMOTE','ONLINE','MIXED') AND
  "eventType" IN ('OLYMPIAD','CONTEST','CONFERENCE','COMPETITION','FESTIVAL','HACKATHON','OTHER') AND
  "participants" IN ('UNKNOWN','UP_TO_50','UP_TO_100','UP_TO_500','OVER_500') AND
  "level" IN ('OTHER','UNIVERSITY','CITY','REGIONAL','NATIONAL','INTERNATIONAL') AND
  "eventDate" >= DATE '2000-01-01' AND
  length("title") BETWEEN 3 AND 200 AND
  ("comment" IS NULL OR length("comment") BETWEEN 1 AND 500) AND
  ("rulesUrl" IS NULL OR (length("rulesUrl") <= 500 AND "rulesUrl" ~ '^https?://')) AND
  ("eventUrl" IS NULL OR (length("eventUrl") <= 500 AND "eventUrl" ~ '^https?://')) AND
  jsonb_typeof("organizers") = 'array' AND jsonb_array_length("organizers") <= 3 AND
  "version" > 0 AND "reviewRound" >= 0
 ),
 CONSTRAINT "PortfolioItem_file" CHECK (
  "byteSize" BETWEEN 1 AND 3145728 AND length("content") = "byteSize" AND "sha256" ~ '^[a-f0-9]{64}$'
 ),
 CONSTRAINT "PortfolioItem_review" CHECK (
  ("status" = 'PRIVATE' AND "submittedAt" IS NULL AND "reviewRound" = 0 AND "reviewerId" IS NULL AND "reviewedAt" IS NULL AND "reviewComment" IS NULL) OR
  ("status" = 'PENDING' AND "submittedAt" IS NOT NULL AND "reviewerId" IS NULL AND "reviewedAt" IS NULL AND "reviewComment" IS NULL) OR
  ("status" = 'APPROVED' AND "submittedAt" IS NOT NULL AND "reviewRound" > 0 AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND ("reviewComment" IS NULL OR length("reviewComment") BETWEEN 1 AND 500)) OR
  ("status" = 'REJECTED' AND "submittedAt" IS NOT NULL AND "reviewRound" > 0 AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND length("reviewComment") BETWEEN 3 AND 500)
 ),
 CONSTRAINT "PortfolioItem_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PortfolioItem_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PortfolioItem_id_membershipId_universityId_key" ON "PortfolioItem"("id", "membershipId", "universityId");
CREATE INDEX "PortfolioItem_universityId_status_submittedAt_id_idx" ON "PortfolioItem"("universityId", "status", "submittedAt", "id");
CREATE INDEX "PortfolioItem_membershipId_universityId_createdAt_id_idx" ON "PortfolioItem"("membershipId", "universityId", "createdAt", "id");

-- Уведомление студенту о решении деканата: отдельный ключ на каждый раунд проверки.
ALTER TABLE "Notification" ADD COLUMN "portfolioItemId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_portfolioItemId_recipientMembershipId_univers_fkey" FOREIGN KEY ("portfolioItemId", "recipientMembershipId", "universityId") REFERENCES "PortfolioItem"("id", "membershipId", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" DROP CONSTRAINT notification_kind;
ALTER TABLE "Notification" ADD CONSTRAINT notification_kind CHECK (
 "schemaVersion" = 1 AND "kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED','APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED','SCHEDULE_CANCELLED','PORTFOLIO_APPROVED','PORTFOLIO_REJECTED') AND length("sourceKey") BETWEEN 1 AND 200
);
ALTER TABLE "Notification" DROP CONSTRAINT notification_source;
ALTER TABLE "Notification" ADD CONSTRAINT notification_source CHECK (
 ("kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED') AND "enrollmentRequestId" IS NOT NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "sourceKey" = 'enrollment:' || "enrollmentRequestId" || ':decision') OR
 ("kind" IN ('APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NOT NULL AND "applicationEventId" IS NOT NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "sourceKey" = 'application:' || "applicationEventId") OR
 ("kind" = 'SCHEDULE_CANCELLED' AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NOT NULL AND "portfolioItemId" IS NULL AND "sourceKey" = 'cancellation:' || "cancellationId") OR
 ("kind" IN ('PORTFOLIO_APPROVED','PORTFOLIO_REJECTED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NOT NULL AND starts_with("sourceKey", 'portfolio:' || "portfolioItemId" || ':') AND substr("sourceKey", length('portfolio:' || "portfolioItemId" || ':') + 1) ~ '^[1-9][0-9]{0,5}$')
);
