-- Referral Sources (UTM)
-- Visualization: Bar chart (horizontal) or Table

SELECT
  utm_source AS source,
  COUNT(*) AS signups
FROM users
WHERE utm_source IS NOT NULL AND utm_source != ''
GROUP BY utm_source
ORDER BY signups DESC;
