-- Daily Active Users (from historical snapshots)
-- Visualization: Line chart (date x-axis, DAU y-axis)
-- DAU is computed via Hackatime /api/summary endpoint: users with >0 coding seconds that day.
-- Requires historical_metrics to be populated by the daily cron or backfill.

SELECT
  date,
  value::INTEGER AS dau
FROM historical_metrics
WHERE metric = 'dau'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date ASC;


-- DAU Summary Cards (today, avg 7d, avg 30d, % growth)
-- Visualization: Scalar / Number cards

WITH dau_data AS (
  SELECT date, value::NUMERIC AS dau
  FROM historical_metrics
  WHERE metric = 'dau'
    AND date >= CURRENT_DATE - INTERVAL '30 days'
),
last_7 AS (
  SELECT AVG(dau) AS avg_dau FROM dau_data WHERE date >= CURRENT_DATE - INTERVAL '7 days'
),
prev_7 AS (
  SELECT AVG(dau) AS avg_dau FROM dau_data
  WHERE date >= CURRENT_DATE - INTERVAL '14 days'
    AND date < CURRENT_DATE - INTERVAL '7 days'
)
SELECT
  (SELECT dau FROM dau_data ORDER BY date DESC LIMIT 1) AS dau_today,
  ROUND((SELECT avg_dau FROM last_7), 1) AS avg_dau_7d,
  ROUND((SELECT AVG(dau) FROM dau_data), 1) AS avg_dau_30d,
  CASE
    WHEN (SELECT avg_dau FROM prev_7) > 0
    THEN ROUND(
      ((SELECT avg_dau FROM last_7) - (SELECT avg_dau FROM prev_7))
      / (SELECT avg_dau FROM prev_7) * 100, 2
    )
    ELSE 0
  END AS dau_growth_percent_7d;
