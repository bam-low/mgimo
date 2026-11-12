-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "submittedGroupId" TEXT NOT NULL,
    "submittedGroupName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT,
    "responseText" TEXT,
    "takenById" TEXT,
    "takenAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "currentDocumentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "replacesDocumentId" TEXT,
    "replacementReason" TEXT,
    "demoConfirmed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "publicText" TEXT,
    "documentId" TEXT,
    "applicationVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_currentDocumentId_key" ON "Application"("currentDocumentId");

-- CreateIndex
CREATE INDEX "Application_universityId_status_kind_createdAt_id_idx" ON "Application"("universityId", "status", "kind", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Application_membershipId_createdAt_id_idx" ON "Application"("membershipId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Application_id_universityId_key" ON "Application"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_currentDocumentId_id_universityId_key" ON "Application"("currentDocumentId", "id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_replacesDocumentId_key" ON "ApplicationDocument"("replacesDocumentId");

-- CreateIndex
CREATE INDEX "ApplicationDocument_universityId_applicationId_idx" ON "ApplicationDocument"("universityId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_id_applicationId_universityId_key" ON "ApplicationDocument"("id", "applicationId", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_applicationId_revision_key" ON "ApplicationDocument"("applicationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_replacesDocumentId_applicationId_univer_key" ON "ApplicationDocument"("replacesDocumentId", "applicationId", "universityId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_id_idx" ON "ApplicationEvent"("applicationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_submittedGroupId_fkey" FOREIGN KEY ("submittedGroupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_currentDocumentId_id_universityId_fkey" FOREIGN KEY ("currentDocumentId", "id", "universityId") REFERENCES "ApplicationDocument"("id", "applicationId", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_universityId_fkey" FOREIGN KEY ("applicationId", "universityId") REFERENCES "Application"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_replacesDocumentId_applicationId_unive_fkey" FOREIGN KEY ("replacesDocumentId", "applicationId", "universityId") REFERENCES "ApplicationDocument"("id", "applicationId", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_universityId_fkey" FOREIGN KEY ("applicationId", "universityId") REFERENCES "Application"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Application" ADD CONSTRAINT "Application_state_check" CHECK (
 "kind" IN ('GENERAL_REQUEST','STUDY_CERTIFICATE') AND "status" IN ('SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED') AND "version">0
 AND length(trim("subject")) BETWEEN 3 AND 120
 AND (("kind"='GENERAL_REQUEST' AND "purpose" IS NULL AND length(trim("description")) BETWEEN 10 AND 3000 AND "description" IS NOT NULL AND "currentDocumentId" IS NULL)
 OR ("kind"='STUDY_CERTIFICATE' AND "purpose" IS NOT NULL AND length(trim("purpose")) BETWEEN 3 AND 300 AND ("description" IS NULL OR length("description")<=1000)))
 AND (("status"='SUBMITTED' AND "takenAt" IS NULL AND "takenById" IS NULL AND "resolvedAt" IS NULL AND "resolvedById" IS NULL AND "responseText" IS NULL)
 OR ("status"='IN_PROGRESS' AND "takenAt" IS NOT NULL AND "takenById" IS NOT NULL AND "resolvedAt" IS NULL AND "resolvedById" IS NULL AND "responseText" IS NULL)
 OR ("status"='COMPLETED' AND "takenAt" IS NOT NULL AND "takenById" IS NOT NULL AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL AND "responseText" IS NOT NULL AND length(trim("responseText")) BETWEEN 1 AND 4000 AND ("kind"='GENERAL_REQUEST' OR "currentDocumentId" IS NOT NULL))
 OR ("status"='REJECTED' AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL AND "responseText" IS NOT NULL AND length(trim("responseText")) BETWEEN 10 AND 2000))
 AND ("currentDocumentId" IS NULL OR "status" IN ('IN_PROGRESS','COMPLETED','REJECTED'))
);
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_bytes_check" CHECK (
 "revision" BETWEEN 1 AND 5 AND "mediaType" IN ('application/pdf','image/jpeg','image/png')
 AND "byteSize" BETWEEN 1 AND 3145728 AND octet_length("content")="byteSize"
 AND "sha256" ~ '^[a-f0-9]{64}$' AND "demoConfirmed"=true
 AND (("revision"=1 AND "replacesDocumentId" IS NULL AND "replacementReason" IS NULL)
 OR ("revision">1 AND "replacesDocumentId" IS NOT NULL AND length(trim("replacementReason")) BETWEEN 10 AND 500 AND "replacementReason" IS NOT NULL))
);
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_version_check" CHECK (
 "schemaVersion"=1 AND "applicationVersion">0 AND "eventType" IN ('APPLICATION_SUBMITTED','APPLICATION_TAKEN','APPLICATION_COMMENTED','APPLICATION_COMPLETED','APPLICATION_REJECTED','DOCUMENT_UPLOADED','DOCUMENT_REPLACED')
);
CREATE TRIGGER immutable_application_document BEFORE UPDATE OR DELETE ON "ApplicationDocument" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER immutable_application_event BEFORE UPDATE OR DELETE ON "ApplicationEvent" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
