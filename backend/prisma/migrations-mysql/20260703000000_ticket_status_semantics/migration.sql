UPDATE `tickets`
SET `status` = CASE
  WHEN `status` = 'resolved' THEN 'closed'
  WHEN `status` = 'closed' THEN 'invalid'
  WHEN `status` = 'rejected' THEN 'invalid'
  ELSE `status`
END
WHERE `status` IN ('resolved', 'closed', 'rejected');

UPDATE `audit_logs`
SET `old_value` = CASE
  WHEN `old_value` = 'resolved' THEN 'closed'
  WHEN `old_value` = 'closed' THEN 'invalid'
  WHEN `old_value` = 'rejected' THEN 'invalid'
  ELSE `old_value`
END,
`new_value` = CASE
  WHEN `new_value` = 'resolved' THEN 'closed'
  WHEN `new_value` = 'closed' THEN 'invalid'
  WHEN `new_value` = 'rejected' THEN 'invalid'
  ELSE `new_value`
END
WHERE `old_value` IN ('resolved', 'closed', 'rejected')
   OR `new_value` IN ('resolved', 'closed', 'rejected');

UPDATE `audit_logs`
SET `action` = 'permission_invalid'
WHERE `action` = 'permission_rejected';
