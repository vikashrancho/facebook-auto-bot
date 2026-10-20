-- Migration: 20261021_multi_page_support.sql
-- Description: Extends Facebook Auto Bot to support multiple Facebook Pages simultaneously.
--
-- Safe, additive, and idempotent: can be executed multiple times safely in Supabase SQL Editor.
-- Preserves existing default Page and all existing posts.

create extension if not exists "pgcrypto";

-- 1. Extend pages_cache with multi-page management columns
alter table pages_cache add column if not exists access_token text;
alter table pages_cache add column if not exists picture_url text;
alter table pages_cache add column if not exists tasks text[] default '{}';
alter table pages_cache add column if not exists account_name text;
alter table pages_cache add column if not exists is_active boolean not null default true;
alter table pages_cache add column if not exists connected_at timestamptz not null default now();

-- 2. Ensure posts table has destination page tracking and indexes
alter table posts add column if not exists page_id text;
alter table posts add column if not exists page_name text;

create index if not exists posts_page_id_idx on posts (page_id);

-- 3. Backfill existing posts without a page_id using the default page from app_settings
update posts
set page_id = (select default_page_id from app_settings where id = 1),
    page_name = (select default_page_name from app_settings where id = 1)
where page_id is null
  and exists (select 1 from app_settings where id = 1 and default_page_id is not null);

-- 4. Backfill default_page_token into pages_cache for the default page if access_token is empty
update pages_cache
set access_token = (select default_page_token from app_settings where id = 1),
    account_name = (select facebook_user_name from app_settings where id = 1)
where (access_token is null or access_token = '')
  and page_id = (select default_page_id from app_settings where id = 1);
