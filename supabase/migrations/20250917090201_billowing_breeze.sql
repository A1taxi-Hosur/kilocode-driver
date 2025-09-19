/*
  # Fix scheduled booking statuses and ride integration

  1. Updates
    - Add new status values to scheduled_bookings status check constraint
    - Ensure proper status flow: pending → assigned → confirmed → driver_arrived → in_progress → completed
    
  2. Status Flow
    - pending: Initial booking state
    - assigned: Driver assigned by system
    - confirmed: Driver accepted the booking
    - driver_arrived: Driver reached pickup location
    - in_progress: Trip started after OTP verification
    - completed: Trip finished successfully
    - cancelled: Booking cancelled
*/

-- Drop existing constraint
ALTER TABLE scheduled_bookings DROP CONSTRAINT IF EXISTS scheduled_bookings_status_check;

-- Add updated constraint with all necessary statuses
ALTER TABLE scheduled_bookings ADD CONSTRAINT scheduled_bookings_status_check 
  CHECK (status = ANY (ARRAY[
    'pending'::text, 
    'assigned'::text, 
    'confirmed'::text, 
    'driver_arrived'::text, 
    'in_progress'::text, 
    'cancelled'::text, 
    'completed'::text
  ]));

-- Create index for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_status_driver_time 
  ON scheduled_bookings (status, assigned_driver_id, scheduled_time);

-- Create index for ride integration queries
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_customer_addresses 
  ON scheduled_bookings (customer_id, pickup_address, destination_address, status);