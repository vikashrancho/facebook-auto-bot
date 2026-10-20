-- Migration: 20261020_content_calendar_and_scheduling.sql
-- Description: Adds scheduling metadata columns, indices, and performance optimizations
-- for the Content Calendar and automatic Facebook background scheduler.
--
-- Safe and idempotent: can be executed multiple times safely in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Add scheduling metadata columns to posts table
alter table posts add column if not exists schedule_notes text;
alter table posts add column if not exists last_attempt_at timestamptz;
alter table posts add column if not exists retry_count integer not null default 0;

-- Composite indices for high-frequency scheduler claiming and calendar date-range lookups
create index if not exists posts_scheduled_cron_idx on posts (status, scheduled_at, approved_by_user)
  where status = 'scheduled';

create index if not exists posts_calendar_range_idx on posts (scheduled_at)
  where scheduled_at is not null;
