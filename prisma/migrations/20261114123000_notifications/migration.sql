-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "recipientMembershipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceKey" TEXT NOT NULL,
    "enrollmentRequestId" TEXT,
    "applicationId" TEXT,
    "applicationEventId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientMembershipId_universityId_createdAt_i_idx" ON "Notification"("recipientMembershipId", "universityId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_universityId_recipientMembershipId_sourceKey_key" ON "Notification"("universityId", "recipientMembershipId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentRequest_id_membershipId_key" ON "EnrollmentRequest"("id", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_id_membershipId_universityId_key" ON "Application"("id", "membershipId", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEvent_id_applicationId_universityId_key" ON "ApplicationEvent"("id", "applicationId", "universityId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientMembershipId_universityId_fkey" FOREIGN KEY ("recipientMembershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_enrollmentRequestId_recipientMembershipId_fkey" FOREIGN KEY ("enrollmentRequestId", "recipientMembershipId") REFERENCES "EnrollmentRequest"("id", "membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_applicationId_recipientMembershipId_universit_fkey" FOREIGN KEY ("applicationId", "recipientMembershipId", "universityId") REFERENCES "Application"("id", "membershipId", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_applicationEventId_applicationId_universityId_fkey" FOREIGN KEY ("applicationEventId", "applicationId", "universityId") REFERENCES "ApplicationEvent"("id", "applicationId", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill: existing domain history remains untouched.
ALTER TABLE "Notification" ADD CONSTRAINT notification_kind CHECK (
 "schemaVersion" = 1 AND "kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED','APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED') AND length("sourceKey") BETWEEN 1 AND 200
);
ALTER TABLE "Notification" ADD CONSTRAINT notification_source CHECK (
 ("kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED') AND "enrollmentRequestId" IS NOT NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "sourceKey" = 'enrollment:' || "enrollmentRequestId" || ':decision') OR
 ("kind" NOT IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NOT NULL AND "applicationEventId" IS NOT NULL AND "sourceKey" = 'application:' || "applicationEventId")
);
ALTER TABLE "Notification" ADD CONSTRAINT notification_read_time CHECK ("readAt" IS NULL OR "readAt" >= "createdAt");
CREATE INDEX notification_unread ON "Notification" ("recipientMembershipId","universityId","createdAt","id") WHERE "readAt" IS NULL;
CREATE FUNCTION public.guard_notification_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW) - 'readAt') IS DISTINCT FROM (to_jsonb(OLD) - 'readAt') OR OLD."readAt" IS NOT NULL OR NEW."readAt" IS NULL THEN
  RAISE EXCEPTION 'Notification history is immutable';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_read() FROM PUBLIC;
CREATE TRIGGER notification_read_once BEFORE UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION public.guard_notification_read();
CREATE TRIGGER immutable_notification_delete BEFORE DELETE ON "Notification" FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
