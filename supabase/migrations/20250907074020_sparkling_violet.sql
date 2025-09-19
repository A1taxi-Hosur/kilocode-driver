/*
  # Create authenticate_driver RPC function

  1. New Functions
    - `authenticate_driver(p_username, p_password)` - Authenticates driver with custom credentials
    
  2. Security
    - Function runs with elevated privileges to bypass RLS
    - Only returns success status and user_id, no sensitive data
    - Handles both plain text and bcrypt passwords
*/

CREATE OR REPLACE FUNCTION authenticate_driver(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_password_hash TEXT;
  v_is_valid BOOLEAN := FALSE;
BEGIN
  -- Find driver credentials (case insensitive)
  SELECT user_id, password_hash
  INTO v_user_id, v_password_hash
  FROM driver_credentials
  WHERE LOWER(username) = LOWER(p_username);
  
  -- If no credentials found
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid credentials');
  END IF;
  
  -- Try direct password comparison first (for plain text passwords)
  IF p_password = v_password_hash THEN
    v_is_valid := TRUE;
  ELSE
    -- Try bcrypt comparison (for hashed passwords)
    BEGIN
      SELECT crypt(p_password, v_password_hash) = v_password_hash INTO v_is_valid;
    EXCEPTION WHEN OTHERS THEN
      v_is_valid := FALSE;
    END;
  END IF;
  
  -- Return result
  IF v_is_valid THEN
    RETURN json_build_object(
      'success', true, 
      'user_id', v_user_id,
      'message', 'Authentication successful'
    );
  ELSE
    RETURN json_build_object('success', false, 'message', 'Invalid credentials');
  END IF;
END;
$$;