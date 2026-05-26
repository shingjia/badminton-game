-- AlterTable
ALTER TABLE "AdminConfig" ADD COLUMN     "siteIcon" TEXT NOT NULL DEFAULT '🏸',
ADD COLUMN     "siteName" TEXT NOT NULL DEFAULT '羽球友誼賽';

-- DropView + recreate pair_standings to add losses and points_against columns
DROP VIEW IF EXISTS pair_standings;

CREATE VIEW pair_standings AS
SELECT
  p.id                              AS pair_id,
  p."groupId"                       AS group_id,
  p."tournamentId"                  AS tournament_id,
  COUNT(*) FILTER (
    WHERE (m."pairAId" = p.id AND m."scoreA" > m."scoreB")
       OR (m."pairBId" = p.id AND m."scoreB" > m."scoreA")
  )                                 AS wins,
  COUNT(*) FILTER (
    WHERE (m."pairAId" = p.id AND m."scoreA" < m."scoreB")
       OR (m."pairBId" = p.id AND m."scoreB" < m."scoreA")
  )                                 AS losses,
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
  ), 0)                             AS points_for,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreB"
         WHEN m."pairBId" = p.id THEN m."scoreA"
         ELSE 0 END
  ), 0)                             AS points_against
FROM "Pair" p
LEFT JOIN "Match" m
  ON (m."pairAId" = p.id OR m."pairBId" = p.id)
 AND m.status = 'completed'
GROUP BY p.id, p."groupId", p."tournamentId";
