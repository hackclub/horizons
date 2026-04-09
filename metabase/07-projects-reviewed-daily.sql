-- Projects Reviewed Per Day (past 30 days)
-- Visualization: Line chart (date x-axis, count y-axis)

SELECT
  DATE(reviewed_at) AS review_date,
  COUNT(*) AS reviews_completed
FROM submissions
WHERE reviewed_at IS NOT NULL
  AND reviewed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(reviewed_at)
ORDER BY review_date ASC;
