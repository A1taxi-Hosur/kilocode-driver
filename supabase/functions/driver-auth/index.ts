const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

import { createClient } from "npm:@supabase/supabase-js@2";
import { compare } from "npm:bcrypt@5.1.0";

interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          phone_number: string | null
          role: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      drivers: {
        Row: {
          id: string
          user_id: string
          license_number: string
          license_expiry: string
          status: string
          rating: number
          total_rides: number
          is_verified: boolean
          vehicle_id: string | null
          vendor_id: string | null
          created_at: string
          updated_at: string
        }
      }
      driver_credentials: {
        Row: {
          id: string
          user_id: string
          username: string
          password_hash: string
          created_at: string
          updated_at: string
        }
      }
      vehicles: {
        Row: {
          id: string
          driver_id: string | null
          registration_number: string
          make: string
          model: string
          year: number
          color: string
          vehicle_type: string
          capacity: number
          is_verified: boolean
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const url = new URL(req.url);
    const path = url.pathname;

    console.log('Driver Auth API called:', path, req.method);

    if (path.includes('/authenticate') && req.method === 'POST') {
      return await handleDriverAuthentication(supabase, req);
    }

    if (path.includes('/verify-session') && req.method === 'POST') {
      return await handleSessionVerification(supabase, req);
    }

    if (path.includes('/refresh-profile') && req.method === 'POST') {
      return await handleProfileRefresh(supabase, req);
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    );

  } catch (error) {
    console.error('Driver Auth API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function handleDriverAuthentication(supabase: any, req: Request) {
  try {
    const body = await req.json();
    console.log('=== DRIVER AUTHENTICATION REQUEST ===');
    console.log('Request body:', { ...body, password: '[REDACTED]' });

    const { identifier, password } = body;

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Username and password are required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Always use custom credentials for driver authentication
    console.log('Authentication type: Username (Custom Credentials)');
    console.log('Username:', identifier);

    // Use custom credentials authentication
    const authResult = await authenticateWithCustomCredentials(supabase, identifier, password);

    if (!authResult.success) {
      return new Response(
        JSON.stringify(authResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      );
    }

    // Load complete driver profile
    const profileResult = await loadDriverProfile(supabase, authResult.user.id);
    
    if (!profileResult.success) {
      return new Response(
        JSON.stringify(profileResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      );
    }

    // Generate Supabase session for the authenticated user
    console.log('Generating Supabase session for user:', authResult.user.id);
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authResult.user.email,
      options: {
        redirectTo: 'http://localhost:8081'
      }
    });

    if (sessionError) {
      console.error('Error generating session:', sessionError);
      // Continue without session - fallback to service role operations
    }

    // Create a session token for the client
    let sessionToken = null;
    try {
      const { data: tokenData, error: tokenError } = await supabase.auth.admin.createUser({
        email: authResult.user.email,
        user_metadata: {
          driver_id: profileResult.driver.id,
          full_name: authResult.user.full_name,
          role: authResult.user.role
        }
      });
      
      if (!tokenError && tokenData.user) {
        // Generate access token for this user
        const { data: sessionResult, error: sessionErr } = await supabase.auth.admin.generateAccessToken(tokenData.user.id);
        if (!sessionErr && sessionResult) {
          sessionToken = {
            access_token: sessionResult.access_token,
            refresh_token: sessionResult.refresh_token || null,
            expires_in: 3600,
            token_type: 'bearer',
            user: tokenData.user
          };
          console.log('✅ Session token generated successfully');
        }
      }
    } catch (tokenError) {
      console.log('Could not generate session token, continuing without it:', tokenError);
    }
    return new Response(
      JSON.stringify({
        success: true,
        user: authResult.user,
        driver: profileResult.driver,
        session: sessionToken,
        message: 'Authentication successful'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Authentication error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Authentication failed. Please try again.' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function authenticateWithSupabaseAuth(supabase: any, email: string, password: string) {
  try {
    console.log('=== SUPABASE AUTH AUTHENTICATION ===');
    console.log('Email:', email);

    // Use Supabase Auth to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password,
    });

    if (error) {
      console.error('Supabase auth error:', error.message);
      
      let errorMessage = 'Invalid email or password';
      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please check your credentials.';
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email address before signing in.';
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please wait and try again.';
      }

      return {
        success: false,
        error: errorMessage
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Authentication failed'
      };
    }

    console.log('✅ Supabase auth successful');
    return {
      success: true,
      user: data.user,
      session: data.session
    };

  } catch (error) {
    console.error('Supabase auth exception:', error);
    return {
      success: false,
      error: 'Authentication service unavailable'
    };
  }
}

async function authenticateWithCustomCredentials(supabase: any, username: string, password: string) {
  try {
    console.log('=== CUSTOM CREDENTIALS AUTHENTICATION ===');
    console.log('Username:', username);

    // Get driver credentials with user data
    const { data: credentials, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        users!driver_credentials_user_id_fkey(*)
      `)
      .ilike('username', username)
      .single();

    if (error || !credentials) {
      console.log('No credentials found for username:', username);
      
      // Debug: Show all available usernames
      const { data: allCredentials } = await supabase
        .from('driver_credentials')
        .select('username');
      
      console.log('Available usernames:', allCredentials?.map(c => c.username));
      
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    console.log('✅ Credentials found for username:', username);

    // Verify password
    let passwordValid = false;
    
    try {
      // Try bcrypt comparison first (for hashed passwords)
      passwordValid = await compare(password, credentials.password_hash);
      console.log('Bcrypt password check:', passwordValid);
    } catch (bcryptError) {
      // If bcrypt fails, try direct comparison (for plain text passwords)
      passwordValid = password === credentials.password_hash;
      console.log('Direct password check:', passwordValid);
    }

    if (!passwordValid) {
      console.log('❌ Password verification failed');
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    console.log('✅ Password verified successfully');

    // Return user data from the joined query
    return {
      success: true,
      user: {
        id: credentials.users.id,
        email: credentials.users.email,
        ...credentials.users
      },
      session: null // Custom auth doesn't create Supabase session
    };

  } catch (error) {
    console.error('Custom credentials auth exception:', error);
    return {
      success: false,
      error: 'Authentication service unavailable'
    };
  }
}

async function loadDriverProfile(supabase: any, userId: string) {
  try {
    console.log('=== LOADING DRIVER PROFILE ===');
    console.log('User ID:', userId);

    // Get user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('User not found:', userError);
      return {
        success: false,
        error: 'User profile not found'
      };
    }

    // Verify user is a driver
    if (userData.role !== 'driver') {
      console.log('❌ User is not a driver, role:', userData.role);
      return {
        success: false,
        error: 'Access denied. This app is for drivers only.'
      };
    }

    // Verify user is active
    if (!userData.is_active) {
      console.log('❌ User account is inactive');
      return {
        success: false,
        error: 'Your account has been deactivated. Please contact support.'
      };
    }

    console.log('✅ User verified as active driver');

    // Get driver data with vehicle information
    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select(`
        *,
        vehicles!fk_drivers_vehicle(
          id,
          registration_number,
          make,
          model,
          year,
          color,
          vehicle_type,
          capacity,
          is_verified
        )
      `)
      .eq('user_id', userId)
      .single();

    if (driverError || !driverData) {
      console.error('Driver profile not found:', driverError);
      return {
        success: false,
        error: 'Driver profile not found. Please contact your administrator.'
      };
    }

    // Check if driver is verified
    if (!driverData.is_verified) {
      console.log('⚠️ Driver not verified yet');
      return {
        success: false,
        error: 'Your driver account is pending verification. Please contact your administrator.'
      };
    }

    console.log('✅ Driver profile loaded successfully');

    // Combine driver data with user data
    const completeDriverData = {
      ...driverData,
      user: userData,
      vehicle: driverData.vehicles || null
    };

    return {
      success: true,
      driver: completeDriverData
    };

  } catch (error) {
    console.error('Error loading driver profile:', error);
    return {
      success: false,
      error: 'Failed to load driver profile'
    };
  }
}

async function handleSessionVerification(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { access_token } = body;

    if (!access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Access token required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Verify the session token
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid or expired session' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      );
    }

    // Load driver profile
    const profileResult = await loadDriverProfile(supabase, user.id);
    
    if (!profileResult.success) {
      return new Response(
        JSON.stringify(profileResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: user,
        driver: profileResult.driver,
        message: 'Session verified'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Session verification error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Session verification failed' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleProfileRefresh(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User ID required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const profileResult = await loadDriverProfile(supabase, user_id);
    
    if (!profileResult.success) {
      return new Response(
        JSON.stringify(profileResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        driver: profileResult.driver,
        message: 'Profile refreshed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Profile refresh error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Profile refresh failed' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}