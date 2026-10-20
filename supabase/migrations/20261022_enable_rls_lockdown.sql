-- Migration: Enable Row Level Security (RLS) and Lockdown Anonymous Access
-- Date: 2026-10-22
-- Purpose: Protect database tables and storage from unauthorized PostgREST/anonymous access
-- Application architecture: All app routes query Supabase via server-side service-role client.

-- 1. Enable RLS on all application tables that exist
alter table if exists app_settings enable row level security;
alter table if exists posts enable row level security;
alter table if exists pages_cache enable row level security;
alter table if exists topics enable row level security;
alter table if exists templates enable row level security;
alter table if exists content_requests enable row level security;
alter table if exists approval_tokens enable row level security;

-- 2. Dynamically apply RLS policies strictly for service_role on existing tables
-- This safe block checks to_regclass so it never fails with error 42P01 if a table has not been created yet in a specific environment.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['app_settings', 'posts', 'pages_cache', 'topics', 'templates', 'content_requests', 'approval_tokens'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('alter table public.%I enable row level security', tbl);
      EXECUTE format('drop policy if exists %I on public.%I', 'Allow public read of ' || tbl, tbl);
      EXECUTE format('drop policy if exists %I on public.%I', 'Allow anon read of ' || tbl, tbl);
      EXECUTE format('drop policy if exists %I on public.%I', 'Service role has full access to ' || tbl, tbl);
      EXECUTE format('create policy %I on public.%I for all to service_role using (true) with check (true)', 'Service role has full access to ' || tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- 3. Storage Bucket Security:
-- The 'post-images' bucket is public for read-only access because Facebook Graph API
-- requires a publicly accessible direct image URL to publish photos.
-- Write, update, and delete permissions are strictly restricted to service_role.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;
