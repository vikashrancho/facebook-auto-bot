-- Migration: 20261018_content_requests.sql
-- Description: Adds content_requests table for ChatGPT-only post generation bridge
--
-- DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION.
-- Review and run manually in Supabase Dashboard > SQL Editor when upgrading.

create extension if not exists "pgcrypto";

-- Table: content_requests
-- Stores queued content creation ideas generated from the dashboard to be retrieved
-- and processed by the user's Custom GPT (Vetechno FB Auto Post).
create table if not exists content_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'admin',
  platform text not null default 'facebook',
  target_page_id text,
  target_page_name text,
  topic text not null,
  content_type text not null default 'Motivational',
  tone text,
  audience text,
  image_style text,
  aspect_ratio text not null default '1:1',
  status text not null default 'pending_chatgpt', -- 'pending_chatgpt' | 'processing' | 'draft_created' | 'failed' | 'cancelled'
  post_id uuid references posts(id) on delete set null,
  review_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for status filtering and chronology
create index if not exists content_requests_status_idx on content_requests(status);
create index if not exists content_requests_created_idx on content_requests(created_at desc);
create index if not exists content_requests_post_id_idx on content_requests(post_id);

-- Configurable Custom GPT URL in app_settings
alter table app_settings add column if not exists chatgpt_custom_gpt_url text;
