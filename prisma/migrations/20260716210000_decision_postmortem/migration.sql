-- AlterTable
ALTER TABLE "ManagerDecision" ADD COLUMN "matchScore" INTEGER;
ALTER TABLE "ManagerDecision" ADD COLUMN "postMortemJson" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ManagerDecision" ADD COLUMN "decisionSource" TEXT;
