-- Signup Stats
-- Visualization: Scalar card (total) + Table (per event)

-- Total signups
SELECT COUNT(*) AS total_signups FROM users;


-- Signups per event (via pinned events)
-- Visualization: Table or Bar chart

SELECT
  e.title AS event,
  e.slug,
  e.country AS event_country,
  COUNT(pe.id) AS signups
FROM pinned_events pe
INNER JOIN events e ON e.event_id = pe.event_id
GROUP BY e.event_id, e.title, e.slug, e.country
ORDER BY signups DESC;
