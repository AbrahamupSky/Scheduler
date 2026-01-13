/*
  Warnings:

  - Added the required column `updatedAt` to the `SchedulingRules` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SchedulingRules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "minHoursPerWeek" INTEGER NOT NULL DEFAULT 0,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 40,
    "maxDaysPerWeek" INTEGER NOT NULL DEFAULT 6,
    "minRestHours" INTEGER NOT NULL DEFAULT 8,
    "maxShiftHours" INTEGER NOT NULL DEFAULT 10,
    "allowOvertime" BOOLEAN NOT NULL DEFAULT false,
    "enforceFairness" BOOLEAN NOT NULL DEFAULT true,
    "preferAvailability" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchedulingRules_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingRules" ("id", "teamId") SELECT "id", "teamId" FROM "SchedulingRules";
DROP TABLE "SchedulingRules";
ALTER TABLE "new_SchedulingRules" RENAME TO "SchedulingRules";
CREATE UNIQUE INDEX "SchedulingRules_teamId_key" ON "SchedulingRules"("teamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
