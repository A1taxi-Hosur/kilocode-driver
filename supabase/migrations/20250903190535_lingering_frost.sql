/*
  # Fix ride webhook trigger

  1. Database Changes
    - Drop existing problematic trigger and function
    - Create new webhook trigger function with correct syntax
    - Create trigger to call edge function when ride is inserted

  2. Webhook Flow
    - Trigger fires on INSERT to rides table
    - Calls ride-webhooks edge function
    - Edge function processes new ride and notifies drivers
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS ride_webhook_trigger ON rides;
DROP FUNCTION IF EXISTS notify_ride_webhook_pgnet();

-- Create the webhook trigger function using pg_net
CREATE OR REPLACE FUNCTION notify_ride_webhook_pgnet()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT;
  payload JSONB;
BEGIN
  -- Only process new ride requests
  IF NEW.status = 'requested' THEN
    -- Construct the webhook URL
    webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/ride-webhooks';
    
    -- Prepare the payload
    payload := jsonb_build_object(
      'type', 'INSERT',
      'table', 'rides',
      'record', row_to_json(NEW)::jsonb
    );
    
    -- Log the webhook trigger
    RAISE LOG 'RIDE WEBHOOK TRIGGER FIRED for ride ID: %, Status: %, Customer: %', 
      NEW.id, NEW.status, NEW.customer_id;
    RAISE LOG 'Webhook URL: %', webhook_url;
    RAISE LOG 'Payload: %', payload;
    
    -- Make HTTP request using pg_net
    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := payload
    );
    
    RAISE LOG 'Webhook HTTP request sent for ride: %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER ride_webhook_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_ride_webhook_pgnet();

-- Set the required settings for the webhook function
-- Note: These would normally be set by Supabase automatically
-- but we're adding them for completeness
DO $$
BEGIN
  -- Try to set the settings, ignore if they don't exist
  BEGIN
    PERFORM set_config('app.settings.supabase_url', current_setting('supabase.url', true), false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  BEGIN
    PERFORM set_config('app.settings.service_role_key', current_setting('supabase.service_role_key', true), false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;