ALTER TABLE "users" ADD COLUMN "receive_email_notifications" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "setup_status" ADD COLUMN "send_email_notifications" BOOLEAN NOT NULL DEFAULT false;
