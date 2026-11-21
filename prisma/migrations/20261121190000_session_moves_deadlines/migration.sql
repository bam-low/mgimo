-- Сессия (экзамены и зачёты), история переносов занятий, дедлайны деканата.
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deadlineId" TEXT,
ADD COLUMN     "examId" TEXT,
ADD COLUMN     "scheduleChangeId" TEXT;

-- CreateTable
CREATE TABLE "ScheduleChange" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "entryVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "fromStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "fromEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "fromRoom" TEXT,
    "fromTeacher" TEXT,
    "toStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "toEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "toRoom" TEXT,
    "toTeacher" TEXT,
    "groupIds" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "movedFromStartsAt" TIMESTAMPTZ(3),
    "movedFromRoom" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamGroup" (
    "examId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ExamGroup_pkey" PRIMARY KEY ("examId","groupId")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "facultyId" TEXT,
    "programId" TEXT,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineDone" (
    "deadlineId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineDone_pkey" PRIMARY KEY ("deadlineId","membershipId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleChange_id_universityId_key" ON "ScheduleChange"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleChange_entryId_entryVersion_key" ON "ScheduleChange"("entryId", "entryVersion");

-- CreateIndex
CREATE INDEX "Exam_universityId_startsAt_id_idx" ON "Exam"("universityId", "startsAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_id_universityId_key" ON "Exam"("id", "universityId");

-- CreateIndex
CREATE INDEX "ExamGroup_groupId_idx" ON "ExamGroup"("groupId");

-- CreateIndex
CREATE INDEX "Deadline_universityId_dueAt_id_idx" ON "Deadline"("universityId", "dueAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_id_universityId_key" ON "Deadline"("id", "universityId");

-- CreateIndex
CREATE INDEX "DeadlineDone_membershipId_idx" ON "DeadlineDone"("membershipId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_scheduleChangeId_universityId_fkey" FOREIGN KEY ("scheduleChangeId", "universityId") REFERENCES "ScheduleChange"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_examId_universityId_fkey" FOREIGN KEY ("examId", "universityId") REFERENCES "Exam"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deadlineId_universityId_fkey" FOREIGN KEY ("deadlineId", "universityId") REFERENCES "Deadline"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_entryId_universityId_fkey" FOREIGN KEY ("entryId", "universityId") REFERENCES "ScheduleEntry"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_teacherId_universityId_fkey" FOREIGN KEY ("teacherId", "universityId") REFERENCES "Teacher"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_roomId_universityId_fkey" FOREIGN KEY ("roomId", "universityId") REFERENCES "Room"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGroup" ADD CONSTRAINT "ExamGroup_examId_universityId_fkey" FOREIGN KEY ("examId", "universityId") REFERENCES "Exam"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGroup" ADD CONSTRAINT "ExamGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineDone" ADD CONSTRAINT "DeadlineDone_deadlineId_universityId_fkey" FOREIGN KEY ("deadlineId", "universityId") REFERENCES "Deadline"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineDone" ADD CONSTRAINT "DeadlineDone_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Проверки значений: границы, допустимые типы, ровно одна цель адресата.
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_values" CHECK (
 "entryVersion" > 1 AND
 "id" = "entryId" || ':' || "entryVersion" AND
 "fromEndsAt" > "fromStartsAt" AND "toEndsAt" > "toStartsAt" AND
 jsonb_typeof("groupIds") = 'array' AND jsonb_array_length("groupIds") BETWEEN 1 AND 50
);
-- История переносов неизменяема, как и история отмен.
CREATE TRIGGER immutable_schedule_change BEFORE UPDATE OR DELETE ON "ScheduleChange" FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_values" CHECK (
 "kind" IN ('EXAM','CREDIT','DIFF_CREDIT','CONSULTATION') AND
 "status" IN ('SCHEDULED','CANCELLED') AND
 "endsAt" > "startsAt" AND "endsAt" - "startsAt" <= interval '8 hours' AND
 length("title") BETWEEN 1 AND 200 AND
 length("teacherName") BETWEEN 1 AND 200 AND
 length("roomName") BETWEEN 1 AND 200 AND
 ("movedFromRoom" IS NULL OR "movedFromStartsAt" IS NOT NULL) AND
 "version" > 0
);
ALTER TABLE "ExamGroup" ADD CONSTRAINT "ExamGroup_examId_groupId_universityId_key" UNIQUE ("examId", "groupId", "universityId");

ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_values" CHECK (
 length("title") BETWEEN 1 AND 120 AND
 ("body" IS NULL OR length("body") BETWEEN 1 AND 300) AND
 ("deletedAt" IS NULL OR "deletedAt" >= "createdAt") AND
 (
  ("scope" = 'UNIVERSITY' AND "facultyId" IS NULL AND "programId" IS NULL AND "groupId" IS NULL) OR
  ("scope" = 'FACULTY' AND "facultyId" IS NOT NULL AND "programId" IS NULL AND "groupId" IS NULL) OR
  ("scope" = 'PROGRAM' AND "programId" IS NOT NULL AND "facultyId" IS NULL AND "groupId" IS NULL) OR
  ("scope" = 'GROUP' AND "groupId" IS NOT NULL AND "facultyId" IS NULL AND "programId" IS NULL)
 )
);

-- Уведомления: перенос пары, перенос/отмена экзамена, новый дедлайн и напоминание.
ALTER TABLE "Notification" DROP CONSTRAINT notification_kind;
ALTER TABLE "Notification" ADD CONSTRAINT notification_kind CHECK (
 "schemaVersion" = 1 AND "kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED','APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED','SCHEDULE_CANCELLED','PORTFOLIO_APPROVED','PORTFOLIO_REJECTED','SCHEDULE_MOVED','EXAM_MOVED','EXAM_CANCELLED','DEADLINE_NEW','DEADLINE_SOON') AND length("sourceKey") BETWEEN 1 AND 200
);
ALTER TABLE "Notification" DROP CONSTRAINT notification_source;
ALTER TABLE "Notification" ADD CONSTRAINT notification_source CHECK (
 ("kind" IN ('ENROLLMENT_APPROVED','ENROLLMENT_REJECTED') AND "enrollmentRequestId" IS NOT NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NULL AND "examId" IS NULL AND "deadlineId" IS NULL AND "sourceKey" = 'enrollment:' || "enrollmentRequestId" || ':decision') OR
 ("kind" IN ('APPLICATION_TAKEN','APPLICATION_COMPLETED','APPLICATION_REJECTED','CERTIFICATE_READY','CERTIFICATE_UPDATED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NOT NULL AND "applicationEventId" IS NOT NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NULL AND "examId" IS NULL AND "deadlineId" IS NULL AND "sourceKey" = 'application:' || "applicationEventId") OR
 ("kind" = 'SCHEDULE_CANCELLED' AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NOT NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NULL AND "examId" IS NULL AND "deadlineId" IS NULL AND "sourceKey" = 'cancellation:' || "cancellationId") OR
 ("kind" IN ('PORTFOLIO_APPROVED','PORTFOLIO_REJECTED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NOT NULL AND "scheduleChangeId" IS NULL AND "examId" IS NULL AND "deadlineId" IS NULL AND starts_with("sourceKey", 'portfolio:' || "portfolioItemId" || ':') AND substr("sourceKey", length('portfolio:' || "portfolioItemId" || ':') + 1) ~ '^[1-9][0-9]{0,5}$') OR
 ("kind" = 'SCHEDULE_MOVED' AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NOT NULL AND "examId" IS NULL AND "deadlineId" IS NULL AND "sourceKey" = 'move:' || "scheduleChangeId") OR
 ("kind" IN ('EXAM_MOVED','EXAM_CANCELLED') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NULL AND "examId" IS NOT NULL AND "deadlineId" IS NULL AND starts_with("sourceKey", 'exam:' || "examId" || ':') AND substr("sourceKey", length('exam:' || "examId" || ':') + 1) ~ '^[1-9][0-9]{0,5}$') OR
 ("kind" IN ('DEADLINE_NEW','DEADLINE_SOON') AND "enrollmentRequestId" IS NULL AND "applicationId" IS NULL AND "applicationEventId" IS NULL AND "cancellationId" IS NULL AND "portfolioItemId" IS NULL AND "scheduleChangeId" IS NULL AND "examId" IS NULL AND "deadlineId" IS NOT NULL AND "sourceKey" = 'deadline:' || "deadlineId" || CASE WHEN "kind" = 'DEADLINE_NEW' THEN ':new' ELSE ':soon' END)
);
