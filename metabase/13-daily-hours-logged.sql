-- Daily Total Tracked Hours (from historical snapshots)
-- Visualization: Line chart (date x-axis, hours y-axis)
-- Requires historical_metrics to be populated.

SELECT
  date,
  ROUND(value::NUMERIC, 1) AS total_tracked_hours
FROM historical_metrics
WHERE metric = 'total_tracked_hours'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date ASC;
