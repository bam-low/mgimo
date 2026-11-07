-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mark" INTEGER,
    "credit" TEXT,
    "issuedOn" DATE NOT NULL,
    "authorId" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subject_universityId_name_id_idx" ON "Subject"("universityId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_id_universityId_key" ON "Subject"("id", "universityId");

-- CreateIndex
CREATE INDEX "Grade_membershipId_issuedOn_id_idx" ON "Grade"("membershipId", "issuedOn", "id");

-- CreateIndex
CREATE INDEX "Grade_universityId_subjectId_idx" ON "Grade"("universityId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversityMembership_id_universityId_key" ON "UniversityMembership"("id", "universityId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application validation is backed by database invariants, including NULL handling.
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_result_check" CHECK (
 ("kind"='MARK' AND "mark" IS NOT NULL AND "mark" BETWEEN 2 AND 5 AND "credit" IS NULL)
 OR ("kind"='CREDIT' AND "mark" IS NULL AND "credit" IS NOT NULL AND "credit" IN ('PASSED','FAILED'))
);
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_date_check" CHECK ("issuedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_version_check" CHECK ("version">0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_version_check" CHECK ("version">0);
