-- User Growth
-- Visualization: Scalar / Number cards
-- Returns a single row with all growth metrics.

SELECT
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS new_past_7_days,
  (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') AS new_past_30_days,
  CASE
    WHEN (SELECT COUNT(*) FROM users) - (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days')::NUMERIC
      / ((SELECT COUNT(*) FROM users) - (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'))::NUMERIC
      * 100, 2
    )
    ELSE 0
  END AS growth_percent_7d;
