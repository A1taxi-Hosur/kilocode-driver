/*
  # Set up webhook trigger for ride notifications

  1. Database Functions
    - Create function to call edge function webhook
    - Handle ride INSERT events
    - Send data to ride-webhooks edge function

  2. Triggers
    - Trigger on rides table INSERT
    - Only for new ride requests with status 'requested'

  3. Security
    - Function executes with proper permissions
    - Webhook URL configured for edge function
*/

-- Create function to call webhook
CREATE OR REPLACE FUNCTION notify_ride_webhook()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process new ride requests
  IF NEW.status = 'requested' AND NEW.driver_id IS NULL THEN
    -- Call the edge function webhook
    PERFORM
      net.http_post(
        url := current_setting('app.webhook_url', true) || '/functions/v1/ride-webhooks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'rides',
          'record', row_to_json(NEW),
          'schema', 'public'
        )
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ride_webhook_trigger ON rides;

-- Create trigger for new ride requests
CREATE TRIGGER ride_webhook_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_ride_webhook();

-- Alternative: Use pg_net extension if available
-- This is a more reliable method for webhooks
CREATE OR REPLACE FUNCTION notify_ride_webhook_pgnet()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  service_key text;
BEGIN
  -- Only process new ride requests
  IF NEW.status = 'requested' AND NEW.driver_id IS NULL THEN
    -- Get webhook URL from environment
    webhook_url := current_setting('app.webhook_url', true);
    service_key := current_setting('app.service_role_key', true);
    
    -- Use pg_net if available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := webhook_url || '/functions/v1/ride-webhooks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'rides',
          'record', row_to_json(NEW),
          'schema', 'public'
        )
      );
    ELSE
      -- Log that webhook would be called
      RAISE LOG 'Would call webhook for ride %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to use pg_net version
DROP TRIGGER IF EXISTS ride_webhook_trigger ON rides;
CREATE TRIGGER ride_webhook_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_ride_webhook_pgnet();