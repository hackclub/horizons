-- Cumulative Signups (past 30 days)
-- Visualization: Line chart (date x-axis, cumulative count y-axis)
-- Shows running total of users over time, not daily count.

SELECT
  signup_date,
  SUM(daily_count) OVER (ORDER BY signup_date) AS cumulative_signups
FROM (
  SELECT
    DATE(created_at) AS signup_date,
    COUNT(*) AS daily_count
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY DATE(created_at)
) daily
ORDER BY signup_date ASC;


-- Alternative: Total users as-of each day (from historical snapshots)
-- More accurate since it includes users created before the 30-day window.
-- Visualization: Line chart

SELECT
  date,
  value::INTEGER AS total_users
FROM historical_metrics
WHERE metric = 'total_users'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date ASC;
