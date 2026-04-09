-- Review Stats — Hours
-- Visualization: Scalar / Number cards
-- Returns a single row with all hour metrics.

WITH
tracked AS (
  SELECT COALESCE(SUM(now_hackatime_hours), 0) AS hours FROM projects
),
unshipped AS (
  SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
  FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = p.project_id)
),
shipped AS (
  SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
  FROM projects p
  WHERE EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = p.project_id)
),
in_review AS (
  SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
  FROM projects p
  WHERE EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.project_id = p.project_id
      AND s.approval_status = 'pending'
      AND s.created_at = (
        SELECT MAX(s2.created_at) FROM submissions s2
        WHERE s2.project_id = p.project_id
      )
  )
),
approved AS (
  SELECT COALESCE(SUM(approved_hours), 0) AS hours FROM projects
)
SELECT
  ROUND(t.hours::NUMERIC, 1) AS tracked_hours,
  ROUND(u.hours::NUMERIC, 1) AS unshipped_hours,
  ROUND(sh.hours::NUMERIC, 1) AS shipped_hours,
  ROUND(ir.hours::NUMERIC, 1) AS hours_in_review,
  ROUND(a.hours::NUMERIC, 1) AS approved_hours,
  ROUND(a.hours::NUMERIC / 10, 2) AS weighted_grants
FROM tracked t, unshipped u, shipped sh, in_review ir, approved a;
