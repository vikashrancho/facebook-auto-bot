-- Migration: 20261022_scheduling_and_review_workflow.sql
-- Description: Adds timezone support to posts, updates workflow status capabilities,
-- and enhances indexes for the durable scheduler and review dashboard.
--
-- Safe and idempotent: can be executed multiple times safely in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Add scheduled_timezone column to posts table to preserve the user's intended timezone
alter table posts add column if not exists scheduled_timezone text;

-- Ensure schedule_notes, last_attempt_at, and retry_count exist
alter table posts add column if not exists schedule_notes text;
alter table posts add column if not exists last_attempt_at timestamptz;
alter table posts add column if not exists retry_count integer not null default 0;

-- Composite indices for high-frequency scheduler claiming
create index if not exists posts_scheduled_cron_idx on posts (status, scheduled_at, approved_by_user)
  where status = 'scheduled';

create index if not exists posts_calendar_range_idx on posts (scheduled_at)
  where scheduled_at is not null;

create index if not exists posts_approved_status_idx on posts (status, approved_by_user);
