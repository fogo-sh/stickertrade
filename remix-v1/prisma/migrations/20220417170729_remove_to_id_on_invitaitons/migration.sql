/*
  Warnings:

  - You are about to drop the column `toId` on the `Invitation` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invitation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("createdAt", "fromId", "id", "message", "updatedAt") SELECT "createdAt", "fromId", "id", "message", "updatedAt" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
