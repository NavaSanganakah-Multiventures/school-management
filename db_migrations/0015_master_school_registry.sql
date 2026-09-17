-- =============================================================
-- Migration 0015: Master School Registry & Multi-Worker Orchestration
-- Description: Enables Pragnya Mitra to manage dedicated Cloudflare
--              Workers, D1 UUIDs, R2 Buckets, Git Branches, and
--              Zero-DB-Cost Edge Environment Configs per school.
-- =============================================================

CREATE TABLE IF NOT EXISTS master_schools (
    id TEXT PRIMARY KEY,
    school_slug TEXT UNIQUE NOT NULL,
    school_name TEXT NOT NULL,
    custom_domain TEXT,
    cf_worker_name TEXT NOT NULL,
    cf_worker_url TEXT NOT NULL,
    cf_d1_database_uuid TEXT NOT NULL,
    cf_d1_database_name TEXT NOT NULL,
    cf_r2_bucket_name TEXT NOT NULL,
    cf_kv_namespace_id TEXT,
    github_repo_url TEXT NOT NULL,
    github_branch TEXT DEFAULT 'main',
    deployment_status TEXT DEFAULT 'Active',
    last_deployment_sha TEXT,
    last_deployed_at TEXT,
    config_sync_status TEXT DEFAULT 'Synced',
    subscription_plan TEXT DEFAULT 'pro',
    license_status TEXT DEFAULT 'Active',
    license_expiry_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_master_schools_slug ON master_schools(school_slug);
CREATE INDEX IF NOT EXISTS idx_master_schools_worker ON master_schools(cf_worker_name);
CREATE INDEX IF NOT EXISTS idx_master_schools_status ON master_schools(deployment_status);

CREATE TABLE IF NOT EXISTS master_school_configs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES master_schools(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,
    is_secret INTEGER DEFAULT 0,
    synced_to_worker INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(school_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_master_configs_school ON master_school_configs(school_id);

CREATE TABLE IF NOT EXISTS master_orchestration_logs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orchestration_logs_school ON master_orchestration_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_logs_action ON master_orchestration_logs(action_type);
