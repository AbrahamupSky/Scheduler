/*
  Warnings:

  - A unique constraint covering the columns `[ownerId,name]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[teamId,name]` on the table `TeamMember` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "AvailabilityWindow_memberId_dayOfWeek_idx" ON "AvailabilityWindow"("memberId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ShiftTemplate_teamId_day_jobType_startTime_endTime_idx" ON "ShiftTemplate"("teamId", "day", "jobType", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Team_ownerId_name_key" ON "Team"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_name_key" ON "TeamMember"("teamId", "name");
