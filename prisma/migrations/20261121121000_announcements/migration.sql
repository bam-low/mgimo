-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "facultyId" TEXT,
    "programId" TEXT,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
    -- Ровно одна цель, соответствующая уровню адресата.
    CONSTRAINT "Announcement_scope_check" CHECK (
        ("scope" = 'UNIVERSITY' AND "facultyId" IS NULL AND "programId" IS NULL AND "groupId" IS NULL) OR
        ("scope" = 'FACULTY' AND "facultyId" IS NOT NULL AND "programId" IS NULL AND "groupId" IS NULL) OR
        ("scope" = 'PROGRAM' AND "programId" IS NOT NULL AND "facultyId" IS NULL AND "groupId" IS NULL) OR
        ("scope" = 'GROUP' AND "groupId" IS NOT NULL AND "facultyId" IS NULL AND "programId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","membershipId")
);

-- CreateIndex
CREATE INDEX "Announcement_universityId_expiresAt_idx" ON "Announcement"("universityId", "expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_universityId_createdAt_id_idx" ON "Announcement"("universityId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AnnouncementRead_membershipId_idx" ON "AnnouncementRead"("membershipId");

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;
