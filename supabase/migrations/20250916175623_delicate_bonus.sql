/*
  # Add pickup OTP support to scheduled bookings

  1. Schema Changes
    - Add `pickup_otp` column to `scheduled_bookings` table
    - Add `drop_otp` column to `scheduled_bookings` table
    - Update status enum to include 'driver_arrived' and 'in_progress'

  2. Security
    - Maintain existing RLS policies
    - Add index for OTP lookups

  3. Notes
    - OTP fields are nullable and cleared after verification
    - Status flow: assigned → confirmed → driver_arrived → in_progress → completed
*/

-- Add OTP columns to scheduled_bookings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_bookings' AND column_name = 'pickup_otp'
  ) THEN
    ALTER TABLE scheduled_bookings ADD COLUMN pickup_otp text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_bookings' AND column_name = 'drop_otp'
  ) THEN
    ALTER TABLE scheduled_bookings ADD COLUMN drop_otp text;
  END IF;
END $$;

-- Update status constraint to include new statuses
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE scheduled_bookings DROP CONSTRAINT IF EXISTS scheduled_bookings_status_check;
  
  -- Add updated constraint with new statuses
  ALTER TABLE scheduled_bookings ADD CONSTRAINT scheduled_bookings_status_check 
    CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'confirmed'::text, 'driver_arrived'::text, 'in_progress'::text, 'cancelled'::text, 'completed'::text]));
END $$;

-- Add indexes for OTP lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_pickup_otp 
  ON scheduled_bookings (pickup_otp) 
  WHERE pickup_otp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_drop_otp 
  ON scheduled_bookings (drop_otp) 
  WHERE drop_otp IS NOT NULL;

-- Add index for status and driver combination for better performance
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_status_driver 
  ON scheduled_bookings (status, assigned_driver_id, scheduled_time);