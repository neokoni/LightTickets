UPDATE "ticket_completion_hooks"
SET "status" = 'skipped'
WHERE "status" = 'cancelled';

UPDATE "audit_logs"
SET "action" = 'completion_hook_skipped'
WHERE "action" = 'completion_hook_cancelled';
