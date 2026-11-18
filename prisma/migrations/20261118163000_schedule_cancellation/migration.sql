CREATE UNIQUE INDEX "ScheduleEntry_id_universityId_key" ON "ScheduleEntry"("id", "universityId");
CREATE TABLE "ScheduleCancellation" (
 "id" TEXT PRIMARY KEY,
 "universityId" TEXT NOT NULL,
 "entryId" TEXT NOT NULL,
 "entryVersion" INTEGER NOT NULL CHECK ("entryVersion" > 0),
 "title" TEXT NOT NULL,
 "startsAt" TIMESTAMPTZ(3) NOT NULL,
 "endsAt" TIMESTAMPTZ(3) NOT NULL,
 "groupIds" JSONB NOT NULL CHECK (jsonb_typeof("groupIds") = 'array' AND jsonb_array_length("groupIds") BETWEEN 1 AND 50),
 CONSTRAINT "ScheduleCancellation_interval" CHECK ("endsAt" > "startsAt"),
 CONSTRAINT "ScheduleCancellation_entryId_universityId_fkey" FOREIGN KEY ("entryId", "universityId") REFERENCES "ScheduleEntry"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE,
 UNIQUE ("id", "universityId"),
 UNIQUE ("entryId", "entryVersion")
);
CREATE TRIGGER immutable_cancellation BEFORE UPDATE OR DELETE ON "ScheduleCancellation" FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
ALTER TABLE "Notification" ADD COLUMN "cancellationId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_cancellationId_universityId_fkey" FOREIGN KEY ("cancellationId", "universityId") REFERENCES "ScheduleCancellation"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" DROP CONSTRAINT notification_kind;
ALTER TABLE "Notification" ADD CONSTRAINT notification_kind CHECK (
 "schemaVersion" = 1 AND "kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED','APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED','SCHEDULE_CANCELLED') AND length("sourceKey") BETWEEN 1 AND 200
);
ALTER TABLE "Notification" DROP CONSTRAINT notification_source;
ALTER TABLE "Notification" ADD CONSTRAINT notification_source CHECK (
 ("kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED') AND "enrollmentRequestId" IS NOT NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "sourceKey" = 'enrollment:' || "enrollmentRequestId" || ':decision') OR
 ("kind" IN ('APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NOT NULL AND "applicationEventId" IS NOT NULL AND "cancellationId" IS NULL AND "sourceKey" = 'application:' || "applicationEventId") OR
 ("kind" = 'SCHEDULE_CANCELLED' AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NOT NULL AND "sourceKey" = 'cancellation:' || "cancellationId")
);
