/*
  # Fix ride webhook trigger

  1. Database Functions
    - Update notify_ride_webhook_pgnet function to ensure it's working
    - Add better logging and error handling
  
  2. Triggers
    - Recreate the ride webhook trigger to ensure it fires on INSERT
    - Add debugging to see when trigger fires
  
  3. Testing
    - Add test function to manually trigger webhook
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ride_webhook_trigger ON rides;

-- Recreate the webhook function with better logging
CREATE OR REPLACE FUNCTION notify_ride_webhook_pgnet()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  response_status int;
BEGIN
  -- Log that trigger was fired
  RAISE LOG 'RIDE WEBHOOK TRIGGER FIRED for ride ID: %', NEW.id;
  RAISE LOG 'Ride status: %, Customer ID: %', NEW.status, NEW.customer_id;
  
  -- Only process new ride requests
  IF NEW.status != 'requested' THEN
    RAISE LOG 'Skipping webhook - ride status is: %', NEW.status;
    RETURN NEW;
  END IF;
  
  -- Build webhook URL
  webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/ride-webhooks';
  
  -- If setting not available, use environment variable approach
  IF webhook_url IS NULL OR webhook_url = '/functions/v1/ride-webhooks' THEN
    -- Use a default URL structure - this will be replaced by the actual Supabase URL
    webhook_url := 'https://whubaypabojomdyfaxcr.supabase.co/functions/v1/ride-webhooks';
  END IF;
  
  RAISE LOG 'Webhook URL: %', webhook_url;
  
  -- Prepare payload
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'rides',
    'record', row_to_json(NEW),
    'event', 'ride_created',
    'ride_id', NEW.id,
    'customer_id', NEW.customer_id,
    'pickup_latitude', NEW.pickup_latitude,
    'pickup_longitude', NEW.pickup_longitude,
    'pickup_address', NEW.pickup_address,
    'destination_address', NEW.destination_address,
    'status', NEW.status,
    'booking_type', NEW.booking_type,
    'vehicle_type', NEW.vehicle_type,
    'fare_amount', NEW.fare_amount,
    'created_at', NEW.created_at
  );
  
  RAISE LOG 'Webhook payload prepared: %', payload;
  
  -- Make HTTP request using pg_net
  BEGIN
    SELECT INTO response_status
      net.http_post(
        url := webhook_url,
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
        body := payload
      );
    
    RAISE LOG 'Webhook HTTP request sent, status: %', response_status;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Webhook HTTP request failed: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER ride_webhook_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_ride_webhook_pgnet();

-- Test function to manually trigger webhook
CREATE OR REPLACE FUNCTION test_ride_webhook(ride_id_param uuid)
RETURNS jsonb AS $$
DECLARE
  ride_record rides%ROWTYPE;
  result jsonb;
BEGIN
  -- Get the ride record
  SELECT * INTO ride_record FROM rides WHERE id = ride_id_param;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ride not found');
  END IF;
  
  -- Manually call the webhook function
  PERFORM notify_ride_webhook_pgnet() FROM rides WHERE id = ride_id_param;
  
  RETURN jsonb_build_object(
    'success', true,
    'ride_id', ride_record.id,
    'message', 'Webhook triggered manually'
  );
END;
$$ LANGUAGE plpgsql;