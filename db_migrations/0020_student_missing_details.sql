-- Migration: 0020_student_missing_details.sql
-- Description: Add missing_details column to students table for AI registration tracking

ALTER TABLE students ADD COLUMN missing_details TEXT;
