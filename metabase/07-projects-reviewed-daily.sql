-- Cumulative Projects Reviewed (past 30 days)
-- Visualization: Line chart (date x-axis, cumulative count y-axis)
-- Shows running total of reviews over time.

SELECT
  review_date,
  SUM(daily_count) OVER (ORDER BY review_date) AS cumulative_reviews
FROM (
  SELECT
    DATE(reviewed_at) AS review_date,
    COUNT(*) AS daily_count
  FROM submissions
  WHERE reviewed_at IS NOT NULL
    AND reviewed_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY DATE(reviewed_at)
) daily
ORDER BY review_date ASC;
