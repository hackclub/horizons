-- Daily Hours Logged (from historical snapshots)
-- Visualization: Line chart (date x-axis, hours y-axis)
-- Shows actual coding hours per day from Hackatime /api/summary, not cumulative.
-- Requires historical_metrics to be populated.

SELECT
  date,
  ROUND(value::NUMERIC, 1) AS daily_hours_logged
FROM historical_metrics
WHERE metric = 'daily_hours_logged'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date ASC;
