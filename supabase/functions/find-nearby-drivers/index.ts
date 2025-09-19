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
      live_locations: {
        Row: {
          id: string
          user_id: string
          latitude: number
          longitude: number
          heading: number | null
          speed: number | null
          accuracy: number | null
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
          created_at: string
          updated_at: string
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  console.log('=== FIND NEARBY DRIVERS FUNCTION CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  if (req.method === "OPTIONS") {
    console.log('Handling OPTIONS request');
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Supabase URL:', supabaseUrl);
    console.log('Service key available:', !!supabaseServiceKey);
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const url = new URL(req.url);
    const path = url.pathname;
    console.log('Request path:', path);

    // Handle both root path and /find-drivers path
    if (req.method === 'POST') {
      console.log('Processing POST request for driver search');
      return await handleFindNearbyDrivers(supabase, req);
    }

    console.log('No matching endpoint found for path:', path);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Endpoint not found',
        path: path,
        method: req.method
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    );

  } catch (error) {
    console.error('Find Nearby Drivers API error:', error);
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
});

async function handleFindNearbyDrivers(supabase: any, req: Request) {
  try {
    console.log('=== FINDING NEARBY DRIVERS - DETAILED DEBUG ===');
    
    const body = await req.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));

    const { 
      pickup_latitude, 
      pickup_longitude, 
      vehicle_type = 'sedan',
      radius_km = 10,
      booking_type = 'regular'
    } = body;

    console.log('Parsed parameters:', {
      pickup_latitude,
      pickup_longitude,
      vehicle_type,
      radius_km,
      booking_type
    });

    if (!pickup_latitude || !pickup_longitude) {
      console.log('❌ Missing required parameters');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'pickup_latitude and pickup_longitude are required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    console.log(`🔍 Searching for drivers near ${pickup_latitude}, ${pickup_longitude}`);
    console.log(`📋 Vehicle type: ${vehicle_type}, Radius: ${radius_km}km`);

    // Step 1: Get ALL drivers first for debugging
    console.log('🔍 Step 1: Fetching ALL drivers for debugging...');
    
    const { data: allDrivers, error: allDriversError } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        status,
        rating,
        total_rides,
        is_verified,
        vehicle_id,
        users!drivers_user_id_fkey(
          id,
          full_name,
          phone_number,
          email
        ),
        vehicles!fk_drivers_vehicle(
          id,
          registration_number,
          make,
          model,
          year,
          color,
          vehicle_type,
          capacity
        )
      `);
    
    if (allDriversError) {
      console.error('❌ Error fetching all drivers:', allDriversError);
    } else {
      console.log('📊 ALL DRIVERS IN DATABASE:');
      console.log(`Total drivers: ${allDrivers?.length || 0}`);
      if (allDrivers && allDrivers.length > 0) {
        allDrivers.forEach((driver, index) => {
          console.log(`Driver ${index + 1}:`, {
            id: driver.id,
            user_id: driver.user_id,
            name: driver.users?.full_name,
            status: driver.status,
            is_verified: driver.is_verified,
            vehicle_type: driver.vehicles?.vehicle_type,
            has_vehicle: !!driver.vehicles
          });
        });
      } else {
        console.log('❌ NO DRIVERS FOUND IN DATABASE!');
      }
    }
    
    // Step 2: Get online and verified drivers
    console.log('🔍 Step 2: Fetching online & verified drivers...');
    
    const { data: onlineDrivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        status,
        rating,
        total_rides,
        is_verified,
        vehicle_id,
        users!drivers_user_id_fkey(
          id,
          full_name,
          phone_number,
          email
        ),
        vehicles!fk_drivers_vehicle(
          id,
          registration_number,
          make,
          model,
          year,
          color,
          vehicle_type,
          capacity
        )
      `)
      .eq('status', 'online')
      .eq('is_verified', true);

    if (driversError) {
      console.error('❌ Error fetching online drivers:', driversError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch drivers: ' + driversError.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    console.log('📊 ONLINE & VERIFIED DRIVERS:');
    console.log(`Found ${onlineDrivers?.length || 0} online & verified drivers`);
    if (onlineDrivers && onlineDrivers.length > 0) {
      onlineDrivers.forEach((driver, index) => {
        console.log(`Online Driver ${index + 1}:`, {
          id: driver.id,
          user_id: driver.user_id,
          name: driver.users?.full_name,
          status: driver.status,
          is_verified: driver.is_verified,
          vehicle_type: driver.vehicles?.vehicle_type,
          has_vehicle: !!driver.vehicles
        });
      });
    } else {
      console.log('❌ NO ONLINE & VERIFIED DRIVERS FOUND');
      console.log('Possible reasons:');
      console.log('1. No drivers have status = "online"');
      console.log('2. No drivers have is_verified = true');
      console.log('3. Database connection issues');
      
      return new Response(
        JSON.stringify({
          success: true,
          drivers: [],
          total_found: 0,
          message: 'No online drivers available',
          debug_info: {
            total_drivers_in_db: allDrivers?.length || 0,
            online_verified_drivers: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Step 3: Get live locations for these drivers
    console.log('📍 Step 3: Fetching live locations...');
    const driverUserIds = onlineDrivers.map(d => d.user_id);
    console.log('Driver user IDs to check locations for:', driverUserIds);
    
    const { data: liveLocations, error: locationsError } = await supabase
      .from('live_locations')
      .select('*')
      .in('user_id', driverUserIds)
      .order('updated_at', { ascending: false });

    if (locationsError) {
      console.error('❌ Error fetching live locations:', locationsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch driver locations: ' + locationsError.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    console.log('📍 LOCATION RECORDS:');
    console.log(`Found ${liveLocations?.length || 0} location records`);
    if (liveLocations && liveLocations.length > 0) {
      liveLocations.forEach((location, index) => {
        const ageMinutes = Math.round((new Date().getTime() - new Date(location.updated_at).getTime()) / (1000 * 60));
        console.log(`Location ${index + 1}:`, {
          user_id: location.user_id,
          coordinates: `${location.latitude}, ${location.longitude}`,
          updated_at: location.updated_at,
          age_minutes: ageMinutes
        });
      });
    } else {
      console.log('❌ NO LOCATION RECORDS FOUND!');
      console.log('This means drivers have not shared their location yet');
      
      return new Response(
        JSON.stringify({
          success: true,
          drivers: [],
          total_found: 0,
          message: 'No driver locations available',
          debug_info: {
            total_drivers_in_db: allDrivers?.length || 0,
            online_verified_drivers: onlineDrivers?.length || 0,
            location_records: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Step 4: Get the most recent location for each driver
    console.log('📍 Step 4: Processing latest locations...');
    const latestLocations = new Map();
    liveLocations?.forEach(loc => {
      if (!latestLocations.has(loc.user_id)) {
        latestLocations.set(loc.user_id, loc);
      }
    });

    console.log(`📍 Latest locations mapped for ${latestLocations.size} drivers`);

    // Step 5: Filter drivers by proximity and vehicle type
    console.log('🎯 Step 5: Filtering drivers by proximity and vehicle type...');
    const nearbyDrivers = [];
    const now = new Date();

    for (const driver of onlineDrivers) {
      console.log(`\n🔍 Processing driver: ${driver.users?.full_name} (${driver.user_id})`);
      
      const location = latestLocations.get(driver.user_id);
      
      if (!location) {
        console.log(`❌ No location data for driver ${driver.user_id} (${driver.users?.full_name})`);
        continue;
      }

      // Check if location is recent (within last 15 minutes - increased for testing)
      const locationAge = now.getTime() - new Date(location.updated_at).getTime();
      const locationAgeMinutes = Math.round(locationAge / (1000 * 60));
      console.log(`📍 Location age: ${locationAgeMinutes} minutes`);
      
      if (locationAge > 15 * 60 * 1000) {
        console.log(`❌ Location too old for driver ${driver.user_id} (${driver.users?.full_name}): ${locationAgeMinutes} minutes old (max 15 minutes)`);
        continue;
      }

      // Check vehicle type if specified and not 'any'
      if (vehicle_type !== 'any' && driver.vehicles?.vehicle_type !== vehicle_type) {
        console.log(`❌ Vehicle type mismatch for driver ${driver.user_id} (${driver.users?.full_name}): ${driver.vehicles?.vehicle_type} != ${vehicle_type}`);
        continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        pickup_latitude,
        pickup_longitude,
        location.latitude,
        location.longitude
      );

      console.log(`📏 Driver ${driver.user_id} (${driver.users?.full_name}) is ${distance.toFixed(1)}km away`);

      if (distance <= radius_km) {
        console.log(`✅ Driver ${driver.users?.full_name} is within range!`);
        nearbyDrivers.push({
          driver_id: driver.id,
          user_id: driver.user_id,
          name: driver.users?.full_name || 'Unknown Driver',
          phone: driver.users?.phone_number,
          email: driver.users?.email,
          rating: driver.rating,
          total_rides: driver.total_rides,
          vehicle: driver.vehicles ? {
            registration_number: driver.vehicles.registration_number,
            make: driver.vehicles.make,
            model: driver.vehicles.model,
            year: driver.vehicles.year,
            color: driver.vehicles.color,
            vehicle_type: driver.vehicles.vehicle_type,
            capacity: driver.vehicles.capacity
          } : null,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            updated_at: location.updated_at
          },
          distance_km: Math.round(distance * 10) / 10, // Round to 1 decimal
          eta_minutes: Math.round(distance * 3) // Rough estimate: 3 minutes per km
        });
      } else {
        console.log(`❌ Driver ${driver.users?.full_name} is too far: ${distance.toFixed(1)}km > ${radius_km}km`);
      }
    }

    // Step 6: Sort by distance (closest first)
    nearbyDrivers.sort((a, b) => a.distance_km - b.distance_km);

    console.log(`🎯 FINAL RESULT: Found ${nearbyDrivers.length} nearby drivers`);
    if (nearbyDrivers.length > 0) {
      console.log('✅ Nearby drivers summary:');
      nearbyDrivers.forEach((driver, index) => {
        console.log(`${index + 1}. ${driver.name} - ${driver.distance_km}km away - ${driver.vehicle?.vehicle_type}`);
      });
    } else {
      console.log('❌ NO NEARBY DRIVERS FOUND');
      console.log('Summary of filtering:');
      console.log(`- Total drivers in DB: ${allDrivers?.length || 0}`);
      console.log(`- Online & verified: ${onlineDrivers?.length || 0}`);
      console.log(`- With recent locations: ${latestLocations.size}`);
      console.log(`- Within ${radius_km}km radius: 0`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        drivers: nearbyDrivers,
        total_found: nearbyDrivers.length,
        search_params: {
          pickup_latitude,
          pickup_longitude,
          vehicle_type,
          radius_km,
          booking_type
        },
        debug_info: {
          total_drivers_in_db: allDrivers?.length || 0,
          online_verified_drivers: onlineDrivers?.length || 0,
          location_records: liveLocations?.length || 0,
          drivers_with_recent_locations: latestLocations.size,
          nearby_drivers_found: nearbyDrivers.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('❌ Error finding nearby drivers:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}