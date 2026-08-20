-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('friendly', 'club');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'friendly';
