-- 0027_subscription_feature_gating_and_requests.sql
-- Subscriptions-based feature gating, director custom requirements during onboarding,
-- and dedicated school feature request tracking.

ALTER TABLE school_tenants ADD COLUMN estimated_students INTEGER DEFAULT 0;
ALTER TABLE school_tenants ADD COLUMN estimated_staff INTEGER DEFAULT 0;
ALTER TABLE school_tenants ADD COLUMN preferred_plan_id TEXT DEFAULT 'trial';
ALTER TABLE school_tenants ADD COLUMN custom_requirements TEXT;

CREATE TABLE IF NOT EXISTS school_feature_requests (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    requested_by_user_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'custom_feature',
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'In_Review', 'Approved', 'Delivered', 'Rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_feature_req_school ON school_feature_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_feature_req_status ON school_feature_requests(status);
