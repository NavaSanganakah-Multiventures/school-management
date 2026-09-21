-- Migration: 0007_fcm_web_topic_reset.sql
-- Description: One-time data cleanup — reset legacy web-device FCM topics after the web-push topic fix.
-- Older web-device rows stored *derived* FCM topics (school_<id>_all + role topic)
-- even though the web client never actually subscribed to them. The web client now
-- subscribes to topics itself and reports the real list on every registration, so
-- reset legacy web rows to an empty list. This keeps direct-token delivery working
-- until those devices re-register with the updated client.
UPDATE fcm_device_tokens SET subscribed_topics = '[]' WHERE device_type = 'web';
