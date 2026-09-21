-- Migration: Plugin Architecture and Subscriptions

-- 1. Plugins Table (Marketplace Inventory)
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK(type IN ('global', 'private')),
    price DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. School Subscriptions (Who bought what)
CREATE TABLE IF NOT EXISTS school_plugins (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'expired')),
    valid_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(school_id) REFERENCES school_tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
    UNIQUE(school_id, plugin_id) -- A school can only have one active record per plugin
);

-- Index for fast lookup of a school's active plugins
CREATE INDEX IF NOT EXISTS idx_school_plugins_active ON school_plugins(school_id, status);

-- Insert a default demo plugin (Global)
INSERT OR IGNORE INTO plugins (id, name, description, type, price, is_active)
VALUES (
    'plugin-ai-reports', 
    'AI Report Analyzer', 
    'Analyze student performance using Artificial Intelligence.', 
    'global', 
    499.00, 
    1
);
