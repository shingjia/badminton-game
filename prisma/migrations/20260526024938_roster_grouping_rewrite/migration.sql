-- DropView (must drop first because it references Team / teamAId / teamBId)
DROP VIEW IF EXISTS team_standings;

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_teamAId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_teamBId_fkey";

-- AlterTable
ALTER TABLE "Tournament" DROP COLUMN "teamsPerGroup",
ADD COLUMN     "groupCount" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "levelCode" TEXT NOT NULL,
ADD COLUMN     "pairingLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "teamAId",
DROP COLUMN "teamBId",
ADD COLUMN     "pairAId" TEXT NOT NULL,
ADD COLUMN     "pairBId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Team";

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "groupId" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pair" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_tournamentId_idx" ON "Player"("tournamentId");

-- CreateIndex
CREATE INDEX "Player_groupId_idx" ON "Player"("groupId");

-- CreateIndex
CREATE INDEX "Pair_tournamentId_idx" ON "Pair"("tournamentId");

-- CreateIndex
CREATE INDEX "Pair_groupId_idx" ON "Pair"("groupId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_pairAId_fkey" FOREIGN KEY ("pairAId") REFERENCES "Pair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_pairBId_fkey" FOREIGN KEY ("pairBId") REFERENCES "Pair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateView (replacement for team_standings, now keyed by pair)
CREATE VIEW pair_standings AS
SELECT
  p.id                              AS pair_id,
  p."groupId"                       AS group_id,
  p."tournamentId"                  AS tournament_id,
  COUNT(*) FILTER (
    WHERE (m."pairAId" = p.id AND m."scoreA" > m."scoreB")
       OR (m."pairBId" = p.id AND m."scoreB" > m."scoreA")
  )                                 AS wins,
  COUNT(*) FILTER (WHERE m.status = 'completed') AS played,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreA" - m."scoreB"
         WHEN m."pairBId" = p.id THEN m."scoreB" - m."scoreA"
         ELSE 0 END
  ), 0)                             AS point_diff,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreA"
         WHEN m."pairBId" = p.id THEN m."scoreB"
         ELSE 0 END
  ), 0)                             AS points_for
FROM "Pair" p
LEFT JOIN "Match" m
  ON (m."pairAId" = p.id OR m."pairBId" = p.id)
 AND m.status = 'completed'
GROUP BY p.id, p."groupId", p."tournamentId";
