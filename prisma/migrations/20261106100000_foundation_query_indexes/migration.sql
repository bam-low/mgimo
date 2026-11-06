-- Additive indexes only: no row rewrites, new domain tables or privilege changes.
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "UniversityMembership_universityId_role_status_id_idx" ON "UniversityMembership"("universityId", "role", "status", "id");
CREATE INDEX "EnrollmentRequest_membershipId_createdAt_id_idx" ON "EnrollmentRequest"("membershipId", "createdAt", "id");
CREATE INDEX "EnrollmentRequest_status_createdAt_id_idx" ON "EnrollmentRequest"("status", "createdAt", "id");
