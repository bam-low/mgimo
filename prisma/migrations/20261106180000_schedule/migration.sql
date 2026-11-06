ALTER TABLE "Faculty" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Program" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StudentGroup" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "ScheduleEntry" (
 "id" TEXT NOT NULL PRIMARY KEY, "groupId" TEXT NOT NULL,
 "title" TEXT NOT NULL, "teacher" TEXT, "room" TEXT,
 "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'SCHEDULED', "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ScheduleEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ScheduleEntry_interval_check" CHECK ("endsAt" > "startsAt"),
 CONSTRAINT "ScheduleEntry_status_check" CHECK ("status" IN ('SCHEDULED','CANCELLED','DELETED'))
);
CREATE INDEX "ScheduleEntry_groupId_startsAt_idx" ON "ScheduleEntry"("groupId","startsAt");
