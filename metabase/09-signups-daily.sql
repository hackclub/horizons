-- Daily Signups (past 30 days)
-- Visualization: Line chart (date x-axis, count y-axis)

SELECT
  DATE(created_at) AS signup_date,
  COUNT(*) AS new_signups
FROM users
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY signup_date ASC;
