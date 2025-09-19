/*
  # Create scheduled_bookings table

  1. New Tables
    - `scheduled_bookings`
      - `id` (uuid, primary key)
      - `customer_id` (uuid, foreign key to users)
      - `booking_type` (text, check constraint for outstation/rental/airport)
      - `vehicle_type` (text)
      - `pickup_address` (text)
      - `destination_address` (text)
      - `pickup_landmark` (text, nullable)
      - `destination_landmark` (text, nullable)
      - `pickup_latitude` (double precision)
      - `pickup_longitude` (double precision)
      - `destination_latitude` (double precision)
      - `destination_longitude` (double precision)
      - `scheduled_time` (timestamptz, nullable)
      - `rental_hours` (integer, nullable)
      - `special_instructions` (text, nullable)
      - `estimated_fare` (numeric, nullable)
      - `status` (text, check constraint for pending/assigned/confirmed/cancelled/completed)
      - `assigned_driver_id` (uuid, foreign key to drivers, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `scheduled_bookings` table
    - Add policies for customers to view their own bookings
    - Add policies for drivers to view and update their assigned bookings
    - Add policies for admins to manage all bookings
*/

CREATE TABLE IF NOT EXISTS public.scheduled_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    booking_type text NOT NULL CHECK (booking_type IN ('outstation', 'rental', 'airport')),
    vehicle_type text NOT NULL,
    pickup_address text NOT NULL,
    destination_address text NOT NULL,
    pickup_landmark text,
    destination_landmark text,
    pickup_latitude double precision NOT NULL,
    pickup_longitude double precision NOT NULL,
    destination_latitude double precision NOT NULL,
    destination_longitude double precision NOT NULL,
    scheduled_time timestamptz,
    rental_hours integer,
    special_instructions text,
    estimated_fare numeric(10,2),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'confirmed', 'cancelled', 'completed')),
    assigned_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.scheduled_bookings ENABLE ROW LEVEL SECURITY;

-- Policy for customers to view their own scheduled bookings
CREATE POLICY "Customers can view their own scheduled bookings" ON public.scheduled_bookings
  FOR SELECT USING (customer_id = auth.uid());

-- Policy for drivers to view their assigned scheduled bookings
CREATE POLICY "Drivers can view their assigned scheduled bookings" ON public.scheduled_bookings
  FOR SELECT USING (assigned_driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  ));

-- Policy for drivers to update their assigned scheduled bookings
CREATE POLICY "Drivers can update their assigned scheduled bookings" ON public.scheduled_bookings
  FOR UPDATE USING (assigned_driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  ));

-- Policy for customers to insert their own scheduled bookings
CREATE POLICY "Customers can insert their own scheduled bookings" ON public.scheduled_bookings
  FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Policy for customers to update their own scheduled bookings
CREATE POLICY "Customers can update their own scheduled bookings" ON public.scheduled_bookings
  FOR UPDATE USING (customer_id = auth.uid());

-- Policy for admins to manage all scheduled bookings
CREATE POLICY "Admins can manage all scheduled bookings" ON public.scheduled_bookings
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_customer_id ON public.scheduled_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_assigned_driver_id ON public.scheduled_bookings(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_status ON public.scheduled_bookings(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_booking_type ON public.scheduled_bookings(booking_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_bookings_scheduled_time ON public.scheduled_bookings(scheduled_time);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduled_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scheduled_bookings_updated_at
    BEFORE UPDATE ON public.scheduled_bookings
    FOR EACH ROW
    EXECUTE PROCEDURE update_scheduled_bookings_updated_at();