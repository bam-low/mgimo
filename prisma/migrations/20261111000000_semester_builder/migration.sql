-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "semesterId" TEXT,
ADD COLUMN     "slotDay" TEXT,
ADD COLUMN     "sourceEntryId" TEXT,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "teacherId" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "universityId" TEXT;

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "start" DATE NOT NULL,
    "end" DATE NOT NULL,
    "anchor" DATE NOT NULL,
    "exclusions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "roomId" TEXT,
    "recurrence" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "once" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateGroup" (
    "templateId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TemplateGroup_pkey" PRIMARY KEY ("templateId","groupId")
);

-- CreateTable
CREATE TABLE "ScheduleGroup" (
    "entryId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScheduleGroup_pkey" PRIMARY KEY ("entryId","groupId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Semester_id_universityId_key" ON "Semester"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_universityId_nameKey_key" ON "Semester"("universityId", "nameKey");

-- CreateIndex
CREATE INDEX "Teacher_universityId_name_id_idx" ON "Teacher"("universityId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_id_universityId_key" ON "Teacher"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_id_universityId_key" ON "Room"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_universityId_nameKey_key" ON "Room"("universityId", "nameKey");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_semesterId_idx" ON "ScheduleTemplate"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplate_id_universityId_key" ON "ScheduleTemplate"("id", "universityId");

-- CreateIndex
CREATE INDEX "ScheduleGroup_groupId_active_idx" ON "ScheduleGroup"("groupId", "active");

-- CreateIndex
CREATE INDEX "ScheduleEntry_universityId_startsAt_idx" ON "ScheduleEntry"("universityId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_templateId_slotDay_generation_key" ON "ScheduleEntry"("templateId", "slotDay", "generation");

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_semesterId_universityId_fkey" FOREIGN KEY ("semesterId", "universityId") REFERENCES "Semester"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_templateId_universityId_fkey" FOREIGN KEY ("templateId", "universityId") REFERENCES "ScheduleTemplate"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_teacherId_universityId_fkey" FOREIGN KEY ("teacherId", "universityId") REFERENCES "Teacher"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_roomId_universityId_fkey" FOREIGN KEY ("roomId", "universityId") REFERENCES "Room"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_universityId_fkey" FOREIGN KEY ("teacherId", "universityId") REFERENCES "Teacher"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_semesterId_universityId_fkey" FOREIGN KEY ("semesterId", "universityId") REFERENCES "Semester"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_teacherId_universityId_fkey" FOREIGN KEY ("teacherId", "universityId") REFERENCES "Teacher"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_roomId_universityId_fkey" FOREIGN KEY ("roomId", "universityId") REFERENCES "Room"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGroup" ADD CONSTRAINT "TemplateGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGroup" ADD CONSTRAINT "TemplateGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleGroup" ADD CONSTRAINT "ScheduleGroup_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ScheduleEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleGroup" ADD CONSTRAINT "ScheduleGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy rows keep text resource snapshots and their original group/history.
-- Typed identities are explicit; identical legacy names do not imply identity.
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_calendar_check" CHECK (
  "start" <= "end" AND EXTRACT(ISODOW FROM "anchor") = 1
  AND "start" >= DATE '0001-01-01' AND "end" <= DATE '9999-12-31'
  AND "anchor" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
  AND jsonb_typeof("exclusions") = 'array' AND "version" > 0
);
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_rule_check" CHECK (
  "recurrence" IN ('EVERY','A','B','ONCE') AND "weekday" BETWEEN 1 AND 7
  AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "startTime" < "endTime" AND "version" > 0
);
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_typed_scope_check" CHECK (
  ("subjectId" IS NULL AND "teacherId" IS NULL AND "roomId" IS NULL AND "semesterId" IS NULL AND "templateId" IS NULL)
  OR ("universityId" IS NOT NULL AND "semesterId" IS NOT NULL AND "subjectId" IS NOT NULL AND "slotDay" IS NOT NULL)
);

ALTER TABLE "ScheduleTemplate" ADD COLUMN "segments" JSONB NOT NULL DEFAULT '[]';
