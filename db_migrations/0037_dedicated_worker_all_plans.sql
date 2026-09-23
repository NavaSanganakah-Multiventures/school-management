-- Migration: 0037_dedicated_worker_all_plans.sql
-- Description: Dedicated workers are now the DEFAULT for every school (all plans).
-- Sets the 'dedicatedWorker' feature flag to true for every plan so billing/admin
-- UIs display consistently — the gate that used to restrict dedicated workers to
-- Enterprise plans only is removed in code (api/lib/provisioning.ts et al).

UPDATE subscription_plans
SET feature_flags = json_set(
    CASE
        WHEN feature_flags IS NULL OR feature_flags = '' THEN '{}'
        ELSE feature_flags
    END,
    '$.dedicatedWorker', true
);