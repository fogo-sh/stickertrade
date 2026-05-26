-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT,
    "toId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "message" TEXT,
    CONSTRAINT "Invitation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "invitationsEnabled" BOOLEAN NOT NULL
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "invitationId" TEXT,
    CONSTRAINT "User_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "id", "passwordHash", "role", "updatedAt", "username") SELECT "avatarUrl", "createdAt", "id", "passwordHash", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_invitationId_key" ON "User"("invitationId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
