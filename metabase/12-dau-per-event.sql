-- DAU Per Event (today, based on pinned event)
-- Visualization: Table or Bar chart
-- Uses project.updated_at as a proxy for activity today.

SELECT
  e.title AS event,
  e.slug,
  COUNT(DISTINCT p.user_id) AS dau_today
FROM projects p
INNER JOIN pinned_events pe ON pe.user_id = p.user_id
INNER JOIN events e ON e.event_id = pe.event_id
WHERE p.updated_at >= CURRENT_DATE
GROUP BY e.event_id, e.title, e.slug
ORDER BY dau_today DESC;
