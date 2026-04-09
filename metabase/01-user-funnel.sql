-- User Funnel
-- Visualization: Funnel chart
-- Each row is a funnel stage with its user count.

SELECT stage, user_count FROM (
  VALUES
    (1, 'Total Users',
      (SELECT COUNT(*) FROM users)),
    (2, 'Has Hackatime Account',
      (SELECT COUNT(*) FROM users WHERE hackatime_account IS NOT NULL)),
    (3, 'Created Project',
      (SELECT COUNT(DISTINCT u.user_id)
       FROM users u
       INNER JOIN projects p ON p.user_id = u.user_id)),
    (4, 'Project with 10+ Hackatime Hours',
      (SELECT COUNT(DISTINCT u.user_id)
       FROM users u
       INNER JOIN projects p ON p.user_id = u.user_id
       WHERE p.now_hackatime_hours >= 10)),
    (5, 'At Least 1 Submission',
      (SELECT COUNT(DISTINCT u.user_id)
       FROM users u
       INNER JOIN projects p ON p.user_id = u.user_id
       INNER JOIN submissions s ON s.project_id = p.project_id)),
    (6, 'At Least 1 Approved Hour',
      (SELECT COUNT(DISTINCT u.user_id)
       FROM users u
       INNER JOIN projects p ON p.user_id = u.user_id
       WHERE p.approved_hours >= 1)),
    (7, '10+ Approved Hours',
      (SELECT COUNT(*) FROM (
        SELECT u.user_id
        FROM users u
        INNER JOIN projects p ON p.user_id = u.user_id
        GROUP BY u.user_id
        HAVING COALESCE(SUM(p.approved_hours), 0) >= 10
      ) sub)),
    (8, '30+ Approved Hours',
      (SELECT COUNT(*) FROM (
        SELECT u.user_id
        FROM users u
        INNER JOIN projects p ON p.user_id = u.user_id
        GROUP BY u.user_id
        HAVING COALESCE(SUM(p.approved_hours), 0) >= 30
      ) sub)),
    (9, '60+ Approved Hours',
      (SELECT COUNT(*) FROM (
        SELECT u.user_id
        FROM users u
        INNER JOIN projects p ON p.user_id = u.user_id
        GROUP BY u.user_id
        HAVING COALESCE(SUM(p.approved_hours), 0) >= 60
      ) sub))
) AS funnel(sort_order, stage, user_count)
ORDER BY sort_order;
