-- Signup Origin → Destination Routes (for map visualization)
-- Visualization: Map (pin map or custom visualization)
-- Shows which countries users are coming from and which event they plan to attend.

-- Route pairs with counts
SELECT
  u.country AS origin_country,
  e.country AS destination_country,
  e.title AS event_title,
  COUNT(*) AS attendees
FROM pinned_events pe
INNER JOIN users u ON u.user_id = pe.user_id
INNER JOIN events e ON e.event_id = pe.event_id
WHERE u.country IS NOT NULL AND u.country != ''
  AND e.country IS NOT NULL AND e.country != ''
GROUP BY u.country, e.country, e.title
ORDER BY attendees DESC;


-- Users per origin country (for pin map)
-- Visualization: Map (pin map by country)

SELECT
  u.country,
  COUNT(*) AS users_attending
FROM pinned_events pe
INNER JOIN users u ON u.user_id = pe.user_id
WHERE u.country IS NOT NULL AND u.country != ''
GROUP BY u.country
ORDER BY users_attending DESC;


-- Users per origin country per event (detailed breakdown)
-- Visualization: Pivot table (country rows, event columns)

SELECT
  u.country AS origin_country,
  e.title AS event,
  COUNT(*) AS attendees
FROM pinned_events pe
INNER JOIN users u ON u.user_id = pe.user_id
INNER JOIN events e ON e.event_id = pe.event_id
WHERE u.country IS NOT NULL AND u.country != ''
GROUP BY u.country, e.title
ORDER BY u.country, attendees DESC;
