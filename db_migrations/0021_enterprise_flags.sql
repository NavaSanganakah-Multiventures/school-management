-- Migration: 0021_enterprise_flags.sql
-- Description: Adds dedicatedWorker flag to enterprise plan.

UPDATE subscription_plans
SET feature_flags = json_set(
  COALESCE(feature_flags, '{}'),
  '$.dedicatedWorker', true
)
WHERE id = 'enterprise';
