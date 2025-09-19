/*
  # Remove pg_net webhook trigger

  1. Changes
    - Drop the webhook trigger that depends on pg_net extension
    - Drop the webhook function that uses net.http_post
    - Keep the basic notification trigger for ride status changes

  2. Reason
    - The pg_net extension is not available in all Supabase environments
    - This removes the dependency on the "net" schema
*/

-- Drop the webhook trigger that causes the net schema error
DROP TRIGGER IF EXISTS ride_webhook_trigger ON rides;

-- Drop the webhook function that uses pg_net
DROP FUNCTION IF EXISTS notify_ride_webhook_pgnet();

-- Keep the existing notification trigger for ride changes
-- This trigger should work without pg_net dependencies