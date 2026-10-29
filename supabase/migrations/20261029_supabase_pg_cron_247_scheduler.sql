-- Enable pg_net and pg_cron extensions for 24/7 background scheduled publishing
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Unschedule prior job if present
SELECT cron.unschedule('process-facebook-scheduled-posts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-facebook-scheduled-posts'
);

-- Schedule native Supabase cron to ping Vercel /api/cron/process-queue every 2 minutes
SELECT cron.schedule(
  'process-facebook-scheduled-posts',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fbautopost.vetechno.in/api/cron/process-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenR0dm53aGl5Z25sdW1rYnZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDQwNDc3MSwiZXhwIjoyMTA1OTgwNzcxfQ.f9iF7LwTiu1FYl8vDnGc_ktfqkrakD7L0zf4Tl_ZcTA"}'::jsonb
  );
  $$
);
