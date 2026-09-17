-- Migration: 0021_dedicated_worker_flag.sql
-- Description: Adds 'dedicatedWorker: true' feature flag to the Enterprise plan

UPDATE subscription_plans
SET feature_flags = json_insert(
    CASE
        WHEN feature_flags IS NULL OR feature_flags = '' THEN '{}'
        ELSE feature_flags
    END,
    '$.dedicatedWorker', true
)
WHERE id = 'enterprise';
