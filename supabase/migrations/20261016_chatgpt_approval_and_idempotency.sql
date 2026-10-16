-- Migration: 20261016_chatgpt_approval_and_idempotency.sql
-- Description: Adds shared persistence for ChatGPT single-use approval tokens
-- and enforces database-level idempotency key uniqueness for staged posts.
--
-- DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION.
-- Review and run manually in Supabase Dashboard > SQL Editor when upgrading.

create extension if not exists "pgcrypto";

-- Table: approval_tokens
-- Shared serverless storage for short-lived, single-use approval tokens.
-- Allows atomic verification and consumption across multiple Vercel instances.
create table if not exists approval_tokens (
  nonce uuid primary key,
  post_id uuid not null references posts(id) on delete cascade,
  content_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fast post lookup and token verification
create index if not exists approval_tokens_post_id_idx on approval_tokens(post_id);

-- Index for periodic cleanup of expired tokens
create index if not exists approval_tokens_expires_at_idx on approval_tokens(expires_at);

-- Server-enforced human approval columns on posts table
alter table posts add column if not exists approved_by_user boolean not null default false;
alter table posts add column if not exists approved_at timestamptz;
alter table posts add column if not exists approval_content_hash text;

-- Idempotency Index
-- Guarantees cross-instance concurrency uniqueness for client-supplied idempotency keys.
create unique index if not exists posts_chatgpt_idempotency_idx on posts (topic) where topic like 'chatgpt:%';
