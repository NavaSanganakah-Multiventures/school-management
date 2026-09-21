-- Migration: 0009_password_reset_tokens.sql
-- Description: Single-use password reset / invite tokens for staff & school users.
-- Tokens are stored only as SHA-256 hashes (never plaintext) and expire after 30 minutes.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('system', 'admin')),
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('invite', 'reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at);
