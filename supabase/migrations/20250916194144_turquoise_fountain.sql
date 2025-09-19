/*
  # Update scheduled bookings table for fare tracking

  1. Schema Changes
    - Ensure estimated_fare column exists and can store calculated fares
    - Add any missing constraints for fare validation

  2. Notes
    - This migration ensures the estimated_fare column can store the calculated fare after trip completion
    - The fare will be calculated based on the specific fare table (rental_fares, outstation_fares, airport_fares)
*/

-- Ensure estimated_fare column exists and has proper constraints
DO $$
BEGIN
  -- Check if estimated_fare column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_bookings' AND column_name = 'estimated_fare'
  ) THEN
    ALTER TABLE scheduled_bookings ADD COLUMN estimated_fare numeric(10,2);
    COMMENT ON COLUMN scheduled_bookings.estimated_fare IS 'Final calculated fare after trip completion';
  END IF;
  
  -- Add constraint to ensure fare is positive if set
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'scheduled_bookings_estimated_fare_check'
  ) THEN
    ALTER TABLE scheduled_bookings 
    ADD CONSTRAINT scheduled_bookings_estimated_fare_check 
    CHECK (estimated_fare IS NULL OR estimated_fare >= 0);
  END IF;
END $$;