/*
  # Add RLS policies for live_locations table

  1. Security
    - Enable RLS on `live_locations` table
    - Add policy for authenticated drivers to manage their own location records

  2. Changes
    - Drivers can SELECT, INSERT, UPDATE, DELETE their own location records
    - Policy uses auth.uid() to match user_id
*/

-- Enable Row Level Security on live_locations table
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- Create policy that allows authenticated users (drivers) to manage their own location records
CREATE POLICY "Drivers can manage their own live location" 
  ON public.live_locations 
  FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Create index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_live_locations_user_id ON public.live_locations(user_id);