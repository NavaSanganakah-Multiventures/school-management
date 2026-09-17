-- Migration: Add target_school_id for private plugins

ALTER TABLE plugins ADD COLUMN target_school_id TEXT;
