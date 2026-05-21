CREATE VIEW team_standings AS
SELECT
  t.id                            AS team_id,
  t."groupId"                     AS group_id,
  t."tournamentId"                AS tournament_id,
  COUNT(*) FILTER (
    WHERE (m."teamAId" = t.id AND m."scoreA" > m."scoreB")
       OR (m."teamBId" = t.id AND m."scoreB" > m."scoreA")
  )                               AS wins,
  COUNT(*) FILTER (WHERE m.status = 'completed') AS played,
  COALESCE(SUM(
    CASE WHEN m."teamAId" = t.id THEN m."scoreA" - m."scoreB"
         WHEN m."teamBId" = t.id THEN m."scoreB" - m."scoreA"
         ELSE 0 END
  ), 0)                           AS point_diff,
  COALESCE(SUM(
    CASE WHEN m."teamAId" = t.id THEN m."scoreA"
         WHEN m."teamBId" = t.id THEN m."scoreB"
         ELSE 0 END
  ), 0)                           AS points_for
FROM "Team" t
LEFT JOIN "Match" m
  ON (m."teamAId" = t.id OR m."teamBId" = t.id)
 AND m.status = 'completed'
GROUP BY t.id, t."groupId", t."tournamentId";
