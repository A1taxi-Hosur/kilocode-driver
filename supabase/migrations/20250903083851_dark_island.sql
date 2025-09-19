/*
  # Add proximity-based ride notifications

  1. Functions
    - `notify_nearby_drivers` - Function to notify drivers within proximity of new ride requests
    - `calculate_distance` - Function to calculate distance between two coordinates

  2. Triggers
    - Trigger on rides table to automatically notify nearby drivers when new ride is created

  3. Indexes
    - Spatial indexes for better location-based queries
*/

-- Function to calculate distance between two coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 NUMERIC, lon1 NUMERIC, 
  lat2 NUMERIC, lon2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  R NUMERIC := 6371; -- Earth's radius in kilometers
  dLat NUMERIC;
  dLon NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  dLat := RADIANS(lat2 - lat1);
  dLon := RADIANS(lon2 - lon1);
  
  a := SIN(dLat/2) * SIN(dLat/2) + 
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
       SIN(dLon/2) * SIN(dLon/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN R * c;
END;
$$ LANGUAGE plpgsql;

-- Function to notify nearby drivers of new ride requests
CREATE OR REPLACE FUNCTION notify_nearby_drivers() 
RETURNS TRIGGER AS $$
DECLARE
  nearby_driver RECORD;
  distance_km NUMERIC;
  max_distance NUMERIC := 5.0; -- 5km radius
BEGIN
  -- Only process new ride requests
  IF NEW.status = 'requested' AND OLD IS NULL THEN
    
    -- Find online drivers within proximity
    FOR nearby_driver IN
      SELECT 
        d.id as driver_id,
        d.user_id,
        ll.latitude as driver_lat,
        ll.longitude as driver_lng
      FROM drivers d
      JOIN live_locations ll ON ll.user_id = d.user_id
      WHERE d.status = 'online' 
        AND d.is_verified = true
        AND ll.updated_at > NOW() - INTERVAL '5 minutes' -- Recent location data
    LOOP
      -- Calculate distance between driver and pickup
      distance_km := calculate_distance(
        nearby_driver.driver_lat, 
        nearby_driver.driver_lng,
        NEW.pickup_latitude, 
        NEW.pickup_longitude
      );
      
      -- If driver is within range, send notification
      IF distance_km <= max_distance THEN
        -- Insert notification for the driver
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          data
        ) VALUES (
          nearby_driver.user_id,
          'ride_request',
          'New Ride Request Nearby!',
          'Pickup: ' || NEW.pickup_address || ' (' || ROUND(distance_km, 1) || 'km away)',
          jsonb_build_object(
            'ride_id', NEW.id,
            'distance_km', ROUND(distance_km, 1),
            'pickup_address', NEW.pickup_address,
            'destination_address', NEW.destination_address,
            'fare_amount', NEW.fare_amount
          )
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for proximity notifications
DROP TRIGGER IF EXISTS proximity_notification_trigger ON rides;
CREATE TRIGGER proximity_notification_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_nearby_drivers();

-- Add spatial indexes for better performance
CREATE INDEX IF NOT EXISTS idx_live_locations_spatial 
ON live_locations USING btree (latitude, longitude, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rides_pickup_location 
ON rides USING btree (pickup_latitude, pickup_longitude, status);

-- Add index for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_type 
ON notifications USING btree (user_id, type, created_at DESC);