-- CreateTable
CREATE TABLE "GradeDismissal" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeDismissal_membershipId_gradeId_key" ON "GradeDismissal"("membershipId", "gradeId");

-- AddForeignKey
ALTER TABLE "GradeDismissal" ADD CONSTRAINT "GradeDismissal_membershipId_universityId_fkey" FOREIGN KEY ("membershipId", "universityId") REFERENCES "UniversityMembership"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeDismissal" ADD CONSTRAINT "GradeDismissal_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
