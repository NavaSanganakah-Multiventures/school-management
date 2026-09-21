-- Migration: 0008_staff_login_accounts.sql
-- Description: Link staff (teachers) records to system_users login accounts so
-- teachers/staff can log in and receive web push notifications.

ALTER TABLE teachers ADD COLUMN login_user_id TEXT;
