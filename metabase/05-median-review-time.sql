-- Median Review Time Over the Past 30 Days
-- Visualization: Line chart (date x-axis, median hours y-axis)
-- Computes the daily median time between submission creation and review.

SELECT
  DATE(reviewed_at) AS review_date,
  ROUND(
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0
    )::NUMERIC, 2
  ) AS median_review_hours,
  COUNT(*) AS reviews_that_day
FROM submissions
WHERE reviewed_at IS NOT NULL
  AND reviewed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(reviewed_at)
ORDER BY review_date ASC;
