-- Migration: 0022_plugin_lms.sql
-- Description: Add LMS plugin to marketplace.

INSERT OR IGNORE INTO plugins (id, name, description, type, price, is_active)
VALUES (
    'plugin-lms',
    'LMS Dashboard Add-on',
    'Advanced learning management features separate from core.',
    'global',
    999.00,
    1
);
