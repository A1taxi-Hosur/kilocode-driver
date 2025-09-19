/*
  # Add scheduled_time column to rides table

  1. New Column
    - `scheduled_time` (timestamptz, nullable)
      - Stores the scheduled pickup time for pre-booked rides
      - Allows admin to schedule rides in advance
      - Nullable for regular on-demand rides

  2. Index
    - Add index on scheduled_time for efficient querying of scheduled rides

  3. Notes
    - This enables the scheduled trips feature for drivers
    - Admin can create rides with future pickup times
    - Drivers can view and manage scheduled trips
*/

-- Add scheduled_time column to rides table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rides' AND column_name = 'scheduled_time'
  ) THEN
    ALTER TABLE rides ADD COLUMN scheduled_time timestamptz;
  END IF;
END $$;

-- Add index for efficient querying of scheduled rides
CREATE INDEX IF NOT EXISTS idx_rides_scheduled_time 
ON rides (scheduled_time) 
WHERE scheduled_time IS NOT NULL;