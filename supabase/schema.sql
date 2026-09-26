-- Facebook Auto Bot — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
--
-- Safe to run again at any time. Every statement only creates what is missing,
-- so re-running this file is also how an existing install is upgraded after
-- pulling a newer version of the app — see the "Upgrades" section at the end.

create extension if not exists "pgcrypto";

-- Singleton settings row (id is always 1). Holds the Facebook tokens, the
-- selected Page, and generation preferences. Single-user app, so one row.
create table if not exists app_settings (
  id smallint primary key default 1,
  -- Meta app credentials. Kept here rather than in env vars so that installing
  -- this app is a paste into Settings, not a redeploy. Never leaves the server.
  facebook_app_id text,
  facebook_app_secret text,
  -- Facebook Login for Business configuration id, when the Meta app uses it.
  facebook_config_id text,
  -- Long-lived user token (~60 days), used only to list Pages and to mint
  -- Page tokens. Posting never uses it directly.
  facebook_user_token text,
  facebook_token_expires_at timestamptz,
  facebook_user_name text,
  -- Page tokens derived from a long-lived user token do not expire, so this is
  -- what the app actually posts with.
  default_page_id text,
  default_page_name text,
  default_page_token text,
  image_source text not null default 'ai',        -- 'ai' | 'stock' | 'mixed'
  utm_suffix text default '',
  auto_post_enabled boolean not null default false,
  posts_per_day smallint not null default 3,
  posting_hours int[] not null default '{9,13,18}', -- local hours (0-23) the queue is allowed to fire
  timezone text not null default 'Asia/Karachi',
  last_auto_post_at timestamptz, -- prevents the autopilot firing twice in one posting-hour slot
  topic_source text not null default 'mine',       -- 'mine' | 'trending' | 'mixed'
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

-- One row per generated/queued/published post. Facebook takes a single
-- `message`, but title/description/hashtags stay separate here so the editor
-- can keep them apart; they are composed at publish time.
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  description text not null,
  hashtags text[] not null default '{}',
  image_url text not null,          -- final image used (Supabase Storage URL)
  image_source text not null,       -- 'ai' | 'stock'
  link_url text,                    -- optional link included in the post
  page_id text,
  page_name text,
  status text not null default 'draft', -- 'draft' | 'scheduled' | 'posted' | 'failed'
  scheduled_at timestamptz,
  posted_at timestamptz,
  facebook_post_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists posts_status_scheduled_idx on posts (status, scheduled_at);
create index if not exists posts_created_idx on posts (created_at desc);

-- Cached list of the Pages this account can post to (refreshed on demand).
create table if not exists pages_cache (
  page_id text primary key,
  name text not null,
  category text,
  fetched_at timestamptz not null default now()
);

-- The owner's own topics and keywords. Autopilot writes about these, taking
-- the least recently used enabled one each time, so the whole list is covered
-- before anything repeats.
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  enabled boolean not null default true,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness, so pasting the same list twice adds nothing.
create unique index if not exists topics_text_lower_idx on topics (lower(text));
create index if not exists topics_rotation_idx on topics (enabled, last_used_at nulls first);

-- Public bucket every generated/sourced image is re-hosted into, so a post's
-- image keeps working even if the free provider it came from goes down later.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Upgrades
--
-- `create table if not exists` leaves an existing table exactly as it was, so
-- columns added to app_settings after the first public release have to be
-- added explicitly for installs that already have the table. Each line is a
-- no-op when the column is already there.
-- ---------------------------------------------------------------------------

alter table app_settings add column if not exists facebook_app_id text;
alter table app_settings add column if not exists facebook_app_secret text;
alter table app_settings add column if not exists facebook_config_id text;
alter table app_settings add column if not exists topic_source text not null default 'mine';
alter table app_settings add column if not exists system_prompt text;
alter table app_settings add column if not exists ai_provider text not null default 'auto';
alter table app_settings add column if not exists gemini_api_key text;
alter table app_settings add column if not exists groq_api_key text;
alter table app_settings add column if not exists openai_api_key text;
alter table app_settings add column if not exists openrouter_api_key text;
alter table app_settings add column if not exists gemini_enabled boolean not null default true;
alter table app_settings add column if not exists groq_enabled boolean not null default true;
alter table app_settings add column if not exists openai_enabled boolean not null default false;
alter table app_settings add column if not exists openrouter_enabled boolean not null default false;

-- Custom Facebook post templates & canvas layouts
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ratio text not null default '1:1', -- '1:1' | '4:5' | '1.91:1' | '9:16'
  width integer not null default 1200,
  height integer not null default 1200,
  background_type text not null default 'gradient', -- 'image' | 'gradient' | 'color'
  background_url text,
  background_gradient text,
  background_color text,
  overlay_opacity numeric not null default 0.2,
  logo_url text,
  logo_position text default 'top-right',
  logo_size integer default 120,
  logo_opacity numeric default 1.0,
  show_logo_backdrop boolean default false,
  text_elements jsonb not null default '[]'::jsonb,
  category text default 'Custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_created_idx on templates (created_at desc);

alter table templates add column if not exists logo_url text;
alter table templates add column if not exists logo_position text default 'top-right';
alter table templates add column if not exists logo_size integer default 120;
alter table templates add column if not exists logo_opacity numeric default 1.0;
alter table templates add column if not exists show_logo_backdrop boolean default false;
