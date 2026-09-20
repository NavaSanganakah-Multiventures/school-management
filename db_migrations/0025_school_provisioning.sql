-- 0025_school_provisioning.sql
-- Phase 2b: SuperAdmin provisioning metadata for dedicated workers.
-- Actual Cloudflare resource creation + deploy is handled by the existing CI
-- pipeline (scripts/provision-school.mjs + scripts/deploy-dedicated.mjs) after
-- schools.json is committed. These columns track per-school provisioning state.

ALTER TABLE school_tenants ADD COLUMN provisioning_status TEXT DEFAULT 'none';
ALTER TABLE school_tenants ADD COLUMN dedicated_slug TEXT;
ALTER TABLE school_tenants ADD COLUMN dedicated_domain TEXT;
ALTER TABLE school_tenants ADD COLUMN d1_database_id TEXT;
ALTER TABLE school_tenants ADD COLUMN r2_bucket_name TEXT;
ALTER TABLE school_tenants ADD COLUMN kv_namespace_id TEXT;
ALTER TABLE school_tenants ADD COLUMN provisioned_at TEXT;
ALTER TABLE school_tenants ADD COLUMN provisioning_error TEXT;
