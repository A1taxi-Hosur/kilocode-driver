const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

import { createClient } from "npm:@supabase/supabase-js@2";

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
        Insert: {
          id?: string
          email: string
          full_name: string
          phone_number?: string | null
          role?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
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
          scheduled_time: string | null
          total_rides: number
          is_verified: boolean
          vehicle_id: string | null
          vendor_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          license_number: string
          license_expiry?: string
          status?: string
          scheduled_time?: string | null
          rating?: number
          total_rides?: number
          is_verified?: boolean
          vehicle_id?: string | null
          vendor_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      driver_credentials: {
        Insert: {
          id?: string
          user_id: string
          username: string
          password_hash: string
          created_at?: string
          updated_at?: string
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          driver_id?: string | null
          registration_number: string
          make: string
          model: string
          year: number
          color: string
          vehicle_type: string
          capacity?: number
          is_verified?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      live_locations: {
        Insert: {
          id?: string
          user_id: string
          latitude: number
          longitude: number
          heading?: number | null
          speed?: number | null
          accuracy?: number | null
          updated_at?: string
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

    console.log('Setup Database API called:', path, req.method);

    if (path.includes('/setup-driver') && req.method === 'POST') {
      return await handleSetupDriver(supabase, req);
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    );

  } catch (error) {
    console.error('Setup Database API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function handleSetupDriver(supabase: any, req: Request) {
  try {
    const body = await req.json();
    console.log('=== SETTING UP DRIVER DATABASE RECORDS ===');
    console.log('Request body:', body);

    const { 
      user_id, 
      driver_id, 
      email = 'driver@example.com',
      full_name = 'Test Driver',
      phone_number = '+1234567890'
    } = body;

    if (!user_id || !driver_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'user_id and driver_id are required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Step 1: Create user record
    console.log('📝 Creating user record...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({
        id: user_id,
        email: email,
        full_name: full_name,
        phone_number: phone_number,
        role: 'driver',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (userError) {
      console.error('❌ Error creating user:', userError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to create user: ${userError.message}` 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    console.log('✅ User created:', userData);

    // Step 2: Create driver record
    console.log('🚗 Creating driver record...');
    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .upsert({
        id: driver_id,
        user_id: user_id,
        license_number: 'TEST123456',
        license_expiry: '2025-12-31',
        status: 'online',
        rating: 5.0,
        total_rides: 0,
        is_verified: true,
        vehicle_id: null,
        vendor_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (driverError) {
      console.error('❌ Error creating driver:', driverError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to create driver: ${driverError.message}` 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    console.log('✅ Driver created:', driverData);

    // Step 3: Create driver credentials
    console.log('🔐 Creating driver credentials...');
    const { data: credentialsData, error: credentialsError } = await supabase
      .from('driver_credentials')
      .upsert({
        user_id: user_id,
        username: 'Rilo',
        password_hash: 'Rilo123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (credentialsError) {
      console.error('❌ Error creating credentials:', credentialsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to create credentials: ${credentialsError.message}` 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    console.log('✅ Credentials created:', credentialsData);

    // Step 4: Create vehicle record
    console.log('🚙 Creating vehicle record...');
    const { data: vehicleData, error: vehicleError } = await supabase
      .from('vehicles')
      .insert({
        driver_id: driver_id,
        registration_number: 'KA01AB1234',
        make: 'Maruti',
        model: 'Swift',
        year: 2020,
        color: 'White',
        vehicle_type: 'hatchback',
        capacity: 4,
        is_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (vehicleError) {
      console.error('❌ Error creating vehicle:', vehicleError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to create vehicle: ${vehicleError.message}` 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    console.log('✅ Vehicle created:', vehicleData);

    // Step 5: Update driver with vehicle_id
    console.log('🔗 Linking vehicle to driver...');
    const { error: linkError } = await supabase
      .from('drivers')
      .update({ vehicle_id: vehicleData.id })
      .eq('id', driver_id);

    if (linkError) {
      console.error('❌ Error linking vehicle:', linkError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to link vehicle: ${linkError.message}` 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    console.log('✅ Vehicle linked to driver');

    // Step 6: Create initial location record
    console.log('📍 Creating initial location...');
    
    const locationData = {
      user_id: user_id,
      latitude: 12.7401984, // Bangalore coordinates to match customer search
      longitude: 77.824,
      heading: null,
      speed: null,
      accuracy: 10,
      updated_at: new Date().toISOString()
    };
    
    // Use upsert for insert or update operation
    const { error: upsertError } = await supabase
      .from('live_locations')
      .upsert(locationData, { onConflict: 'user_id' });

    if (upsertError) {
      // If upsert fails, try manual insert/update
      console.log('⚠️ Upsert failed, attempting manual insert/update:', upsertError.message);
      const { error: insertError } = await supabase
        .from('live_locations')
        .insert(locationData);

      if (insertError) {
        // If insert fails, try to update existing record
        console.log('⚠️ Insert failed, attempting update:', insertError.message);
        const { error: updateError } = await supabase
          .from('live_locations')
          .update({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            heading: locationData.heading,
            speed: locationData.speed,
            accuracy: locationData.accuracy,
            updated_at: locationData.updated_at
          })
          .eq('user_id', user_id);

        if (updateError) {
          console.error('❌ Error updating location:', updateError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Failed to update location: ${updateError.message}` 
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            },
          );
        }
        console.log('✅ Initial location updated');
      } else {
        console.log('✅ Initial location inserted');
      }
    } else {
      console.log('✅ Initial location upserted');
    }

    console.log('🎉 ALL DATABASE RECORDS CREATED SUCCESSFULLY!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'All database records created successfully!',
        data: {
          user: userData,
          driver: driverData,
          credentials: credentialsData,
          vehicle: vehicleData
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error setting up driver:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}