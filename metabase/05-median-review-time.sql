-- Median Review Time — Weekly Average
-- Visualization: Line chart (week x-axis, avg median hours y-axis)
-- Groups daily median review times by ISO week and averages them.

SELECT
  DATE_TRUNC('week', reviewed_at)::DATE AS week_start,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0
    )::NUMERIC, 2
  ) AS avg_median_review_hours,
  COUNT(*) AS reviews_that_week
FROM submissions
WHERE reviewed_at IS NOT NULL
  AND reviewed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('week', reviewed_at)
ORDER BY week_start ASC;
