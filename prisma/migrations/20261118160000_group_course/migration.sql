ALTER TABLE "StudentGroup" ADD COLUMN "course" INTEGER;
ALTER TABLE "StudentGroup" ADD CONSTRAINT "StudentGroup_course_positive" CHECK ("course" IS NULL OR "course" > 0);
