-- CreateTable
CREATE TABLE "AuthCache" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'wielermanager',
    "cookies" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ManagerDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER,
    "matchName" TEXT,
    "decisionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "confidence" REAL,
    "reasoning" TEXT NOT NULL DEFAULT '',
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MigrationMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'legacy',
    "legacyImportAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionsImported" INTEGER NOT NULL DEFAULT 0,
    "authImported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ManagerDecision_matchId_idx" ON "ManagerDecision"("matchId");

-- CreateIndex
CREATE INDEX "ManagerDecision_submittedAt_idx" ON "ManagerDecision"("submittedAt");
