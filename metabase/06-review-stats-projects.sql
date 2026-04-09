-- Review Stats — Projects
-- Visualization: Funnel chart or Scalar / Number cards

SELECT stage, project_count FROM (
  VALUES
    (1, 'Shipped',
      (SELECT COUNT(DISTINCT p.project_id)
       FROM projects p
       INNER JOIN submissions s ON s.project_id = p.project_id)),
    (2, 'Fraud Checked',
      (SELECT COUNT(DISTINCT p.project_id)
       FROM projects p
       INNER JOIN submissions s ON s.project_id = p.project_id
       WHERE p.joe_fraud_passed = TRUE)),
    (3, 'Reviewed',
      (SELECT COUNT(DISTINCT p.project_id)
       FROM projects p
       INNER JOIN submissions s ON s.project_id = p.project_id
       WHERE s.approval_status IN ('approved', 'rejected'))),
    (4, 'Approved',
      (SELECT COUNT(DISTINCT p.project_id)
       FROM projects p
       INNER JOIN submissions s ON s.project_id = p.project_id
       WHERE s.approval_status = 'approved'))
) AS funnel(sort_order, stage, project_count)
ORDER BY sort_order;


-- In Queue (separate card)
-- Fraud-checked projects with only pending submissions (no approved/rejected).

SELECT COUNT(*) AS in_queue
FROM projects p
WHERE p.joe_fraud_passed = TRUE
  AND EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.project_id = p.project_id AND s.approval_status = 'pending'
  )
  AND NOT EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.project_id = p.project_id AND s.approval_status IN ('approved', 'rejected')
  );
