/*
  Warnings:

  - You are about to drop the column `endHHMM` on the `AvailabilityWindow` table. All the data in the column will be lost.
  - You are about to drop the column `startHHMM` on the `AvailabilityWindow` table. All the data in the column will be lost.
  - You are about to drop the column `weekday` on the `AvailabilityWindow` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `endHHMM` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `groupIdentifier` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `groupType` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `ignoreRules` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `person` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `startHHMM` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `IrregularEvent` table. All the data in the column will be lost.
  - You are about to drop the column `allowOvertime` on the `SavedSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `SchedulingRules` table. All the data in the column will be lost.
  - You are about to drop the column `rules` on the `SchedulingRules` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `SchedulingRules` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `endHHMM` on the `ShiftTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `shiftName` on the `ShiftTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `startHHMM` on the `ShiftTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `weekday` on the `ShiftTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Team` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - Added the required column `dayOfWeek` to the `AvailabilityWindow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `AvailabilityWindow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `AvailabilityWindow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `IrregularEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `IrregularEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `IrregularEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `day` to the `ShiftTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `ShiftTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `required` to the `ShiftTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shift` to the `ShiftTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `ShiftTemplate` table without a default value. This is not possible if the table is not empty.
  - Made the column `jobType` on table `ShiftTemplate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ownerId` on table `Team` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AvailabilityWindow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "AvailabilityWindow_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AvailabilityWindow" ("id", "memberId") SELECT "id", "memberId" FROM "AvailabilityWindow";
DROP TABLE "AvailabilityWindow";
ALTER TABLE "new_AvailabilityWindow" RENAME TO "AvailabilityWindow";
CREATE TABLE "new_IrregularEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "jobType" TEXT,
    CONSTRAINT "IrregularEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IrregularEvent" ("date", "id", "teamId") SELECT "date", "id", "teamId" FROM "IrregularEvent";
DROP TABLE "IrregularEvent";
ALTER TABLE "new_IrregularEvent" RENAME TO "IrregularEvent";
CREATE TABLE "new_SavedSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "data" JSONB NOT NULL,
    "optimization" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSchedule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedSchedule" ("createdAt", "data", "endDate", "id", "name", "optimization", "startDate", "teamId") SELECT "createdAt", "data", "endDate", "id", "name", "optimization", "startDate", "teamId" FROM "SavedSchedule";
DROP TABLE "SavedSchedule";
ALTER TABLE "new_SavedSchedule" RENAME TO "SavedSchedule";
CREATE TABLE "new_SchedulingRules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    CONSTRAINT "SchedulingRules_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingRules" ("id", "teamId") SELECT "id", "teamId" FROM "SchedulingRules";
DROP TABLE "SchedulingRules";
ALTER TABLE "new_SchedulingRules" RENAME TO "SchedulingRules";
CREATE UNIQUE INDEX "SchedulingRules_teamId_key" ON "SchedulingRules"("teamId");
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("expiresAt", "id", "token", "userId") SELECT "expiresAt", "id", "token", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE TABLE "new_ShiftTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "shift" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "required" INTEGER NOT NULL,
    CONSTRAINT "ShiftTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShiftTemplate" ("id", "jobType", "teamId") SELECT "id", "jobType", "teamId" FROM "ShiftTemplate";
DROP TABLE "ShiftTemplate";
ALTER TABLE "new_ShiftTemplate" RENAME TO "ShiftTemplate";
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("createdAt", "id", "name", "ownerId") SELECT "createdAt", "id", "name", "ownerId" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE TABLE "new_TeamMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "job" TEXT,
    "position" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeamMember" ("id", "job", "name", "position", "teamId") SELECT "id", "job", "name", "position", "teamId" FROM "TeamMember";
DROP TABLE "TeamMember";
ALTER TABLE "new_TeamMember" RENAME TO "TeamMember";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "username") SELECT "createdAt", "email", "id", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
