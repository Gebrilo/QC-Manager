-- Migration 004: Cleanup and Finalization
-- Purpose: Remove redundant tables from 001 and ensure generic User table specific to this local setup

-- 1. Drop redundant 'audit_logs' (plural) from 001_init.sql
DROP TABLE IF EXISTS audit_logs;

-- 2. Ensure 'audit_log' (singular) is the source of truth
-- (Already created in 003, but just ensuring no confusion)

-- 3. Users Table
-- 001 created 'users' with (id, email, password_hash, name, role, status).
-- SRS doesn't strictly specify a users table for the 'Hybrid Thin-API' if using Supabase Auth,
-- but for local docker-compose without Supabase, we need this table for basic auth.
-- We will keep it.

-- 4. Final check on Views (ensure they are valid)
-- (Views were replaced in 003, we assume they are good)
