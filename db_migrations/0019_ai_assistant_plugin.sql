-- Migration: AI Assistant Plugin & School Settings
-- Description: Adds the AI Assistant plugin to the marketplace and adds ai_credits and gemini_api_key to school_tenants.

-- 1. Insert the AI Assistant Plugin
INSERT OR IGNORE INTO plugins (id, name, description, type, price, is_active)
VALUES (
    'plugin-ai-assistant', 
    'AI Assistant (Gemini)', 
    'Natural language AI assistant for quickly adding students and managing school data. (Credit-based or Custom API Key)', 
    'global', 
    0.00, 
    1
);

-- 2. Add AI settings to school_tenants
ALTER TABLE school_tenants ADD COLUMN ai_credits INTEGER DEFAULT 50;
ALTER TABLE school_tenants ADD COLUMN gemini_api_key TEXT;
