const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

import { createClient } from "npm:@supabase/supabase-js@2";

interface Database {
  public: {
    Tables: {
      rides: {
        Row: {
          id: string
          customer_id: string
          driver_id: string | null
          pickup_latitude: number
          pickup_longitude: number
          pickup_address: string
          destination_address: string
          booking_type: string
          vehicle_type: string
          fare_amount: number
          status: string
          created_at: string
          scheduled_time: string | null
        }
        Insert: {
          customer_id: string
          ride_code: string
          pickup_latitude: number
          pickup_longitude: number
          pickup_address: string
          destination_address: string
          booking_type?: string
          vehicle_type?: string
          fare_amount?: number
          status?: string
          scheduled_time?: string | null
        }
      }
      drivers: {
        Row: {
          id: string
          user_id: string
          status: string
          vehicle_id: string
          is_verified: boolean
        }
      }
      live_locations: {
        Row: {
          user_id: string
          latitude: number
          longitude: number
          updated_at: string
        }
      }
      notifications: {
        Insert: {
          user_id: string
          type: string
          title: string
          message: string
          data?: any
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

    console.log('Driver API called:', path, req.method);

    // Handle different endpoints
    if (path.includes('/notify-drivers') && req.method === 'POST') {
      return await handleNotifyDrivers(supabase, req);
    }

    if (path.includes('/accept-ride') && req.method === 'POST') {
      return await handleAcceptRide(supabase, req);
    }

    if (path.includes('/update-ride-status') && req.method === 'POST') {
      return await handleUpdateRideStatus(supabase, req);
    }

    if (path.includes('/get-nearby-rides') && req.method === 'GET') {
      return await handleGetNearbyRides(supabase, req);
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    );

  } catch (error) {
    console.error('API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function handleNotifyDrivers(supabase: any, req: Request) {
  try {
    console.log('=== NOTIFY DRIVERS FUNCTION CALLED ===');
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    const { ride_id } = body;

    if (!ride_id) {
      console.log('❌ Missing ride_id in request');
      return new Response(
        JSON.stringify({ error: 'ride_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Get ride details with customer info
    console.log('🔍 Fetching ride details for ride_id:', ride_id);
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select(`
        *,
        customer:users!rides_customer_id_fkey(
          id,
          full_name,
          phone_number,
          email
        )
      `)
      .eq('id', ride_id)
      .single();

    if (rideError || !ride) {
      console.error('❌ Error fetching ride:', rideError);
      console.log('Ride data:', ride);
      return new Response(
        JSON.stringify({ error: 'Ride not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      );
    }

    console.log('✅ Ride details fetched successfully:');
    console.log('- Ride ID:', ride.id);
    console.log('- Status:', ride.status);
    console.log('- Pickup:', ride.pickup_address);
    console.log('- Customer:', ride.customer?.full_name);
    console.log('- Vehicle type:', ride.vehicle_type);
    console.log('- Pickup coordinates:', ride.pickup_latitude, ride.pickup_longitude);
    console.log('- Destination coordinates:', ride.destination_latitude, ride.destination_longitude);

    console.log('🔍 Full ride object for debugging:', JSON.stringify(ride, null, 2));

    // Only process rides with 'requested' status
    if (ride.status !== 'requested') {
      console.log('⚠️ Ride status is not "requested":', ride.status);
      return new Response(
        JSON.stringify({ success: true, message: 'Ride not in requested status' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Find nearby drivers
    console.log('🔍 Finding nearby drivers...');
    console.log('Pickup coordinates:', ride.pickup_latitude, ride.pickup_longitude);
    console.log('Vehicle type required:', ride.vehicle_type);
    
    const nearbyDrivers = await findNearbyDrivers(
      supabase,
      ride.pickup_latitude,
      ride.pickup_longitude,
      ride.vehicle_type,
      15 // Increased to 15km radius for better coverage
    );

    console.log(`Found ${nearbyDrivers.length} nearby drivers for ride ${ride.id}`);

    if (nearbyDrivers.length === 0) {
      console.log('❌ No nearby drivers found - updating ride status');
      // Update ride status to no drivers available
      await supabase
        .from('rides')
        .update({ status: 'no_drivers_available' })
        .eq('id', ride.id);

      return new Response(
        JSON.stringify({ success: true, message: 'No drivers available' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Send notifications to all nearby drivers
    console.log('📤 Sending notifications to drivers...');
    let notificationsCreated = 0;
    
    for (const driver of nearbyDrivers) {
      console.log(`Sending notification to driver: ${driver.user_id}`);
      const notificationSent = await sendDriverNotification(supabase, driver, ride);
      if (notificationSent) {
        notificationsCreated++;
      }
      
      // Add small delay between notifications to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ ${notificationsCreated}/${nearbyDrivers.length} notifications sent successfully`);
    
    // If no notifications were sent, update ride status
    if (notificationsCreated === 0) {
      console.log('❌ No notifications sent - updating ride status to no drivers available');
      await supabase
        .from('rides')
        .update({ status: 'no_drivers_available' })
        .eq('id', ride.id);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        drivers_found: nearbyDrivers.length,
        notifications_sent: notificationsCreated
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error notifying drivers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleAcceptRide(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { ride_id, driver_id } = body;

    if (!ride_id || !driver_id) {
      return new Response(
        JSON.stringify({ error: 'ride_id and driver_id are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Update ride with driver assignment
    const { data: updatedRide, error } = await supabase
      .from('rides')
      .update({
        driver_id,
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', ride_id)
      .is('driver_id', null) // Only accept if not already assigned
      .select()
      .single();

    if (error) {
      console.error('Error accepting ride:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to accept ride' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    if (!updatedRide) {
      return new Response(
        JSON.stringify({ error: 'Ride already assigned to another driver' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        },
      );
    }

    // Update driver status to busy
    await supabase
      .from('drivers')
      .update({ status: 'busy' })
      .eq('id', driver_id);

    return new Response(
      JSON.stringify({ success: true, ride: updatedRide }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error accepting ride:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleUpdateRideStatus(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { ride_id, status, driver_id } = body;

    if (!ride_id || !status) {
      return new Response(
        JSON.stringify({ error: 'ride_id and status are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Update ride status
    const { data: updatedRide, error } = await supabase
      .from('rides')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', ride_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating ride status:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update ride status' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    // Update driver status if ride is completed or cancelled
    if ((status === 'completed' || status === 'cancelled') && driver_id) {
      await supabase
        .from('drivers')
        .update({ status: 'online' })
        .eq('id', driver_id);
    }

    return new Response(
      JSON.stringify({ success: true, ride: updatedRide }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error updating ride status:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleGetNearbyRides(supabase: any, req: Request) {
  try {
    const url = new URL(req.url);
    const driver_user_id = url.searchParams.get('driver_user_id');
    const latitude = parseFloat(url.searchParams.get('latitude') || '0');
    const longitude = parseFloat(url.searchParams.get('longitude') || '0');

    if (!driver_user_id || !latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: 'driver_user_id, latitude, and longitude are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Get all pending rides
    const { data: pendingRides, error } = await supabase
      .from('rides')
      .select(`
        *,
        customer:users!rides_customer_id_fkey(
          id,
          full_name,
          phone_number,
          email
        )
      `)
      .eq('status', 'requested')
      .eq('booking_type', 'regular')
      .is('driver_id', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching rides:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rides' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    // Filter by proximity
    const nearbyRides = (pendingRides || []).filter(ride => {
      const distance = calculateDistance(
        latitude,
        longitude,
        ride.pickup_latitude,
        ride.pickup_longitude
      );
      return distance <= 10; // 10km radius
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        rides: nearbyRides,
        count: nearbyRides.length 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error getting nearby rides:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function findNearbyDrivers(
  supabase: any,
  pickupLat: number,
  pickupLng: number,
  vehicleType: string,
  radiusKm: number
) {
  try {
    console.log('=== FINDING NEARBY DRIVERS ===');
    console.log(`📍 Location: ${pickupLat}, ${pickupLng}`);
    console.log(`🚗 Vehicle type: ${vehicleType}`);
    console.log(`📏 Radius: ${radiusKm}km`);

    // Get all online drivers
    console.log('🔍 Fetching online drivers...');
    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        status,
        vehicle_id,
        is_verified,
        rating,
        total_rides,
        vehicles!fk_drivers_vehicle(
          id,
          vehicle_type,
          make,
          model,
          registration_number
        )
      `)
      .eq('status', 'online')
      .eq('is_verified', true);

    if (error) {
      console.error('❌ Error fetching drivers:', error);
      return [];
    }

    if (!drivers || drivers.length === 0) {
      console.log('❌ No online drivers found in database');
      return [];
    }

    console.log(`✅ Found ${drivers.length} online & verified drivers`);
    drivers.forEach((driver, index) => {
      console.log(`Driver ${index + 1}: ${driver.user_id} - Vehicle: ${driver.vehicles?.vehicle_type || 'none'}`);
    });

    // Get latest locations for these drivers
    console.log('📍 Fetching driver locations...');
    const driverUserIds = drivers.map(d => d.user_id);
    console.log('Driver user IDs to check:', driverUserIds);
    
    const { data: locations, error: locationError } = await supabase
      .from('live_locations')
      .select('user_id, latitude, longitude, updated_at')
      .in('user_id', driverUserIds)
      .order('updated_at', { ascending: false })
      .limit(100); // Limit to prevent large queries

    if (locationError) {
      console.error('❌ Error fetching driver locations:', locationError);
      return [];
    }

    console.log(`📍 Found ${locations?.length || 0} location records`);
    if (locations && locations.length > 0) {
      locations.forEach((loc, index) => {
        const ageMinutes = Math.round((Date.now() - new Date(loc.updated_at).getTime()) / (1000 * 60));
        console.log(`Location ${index + 1}: ${loc.user_id} - ${loc.latitude}, ${loc.longitude} (${ageMinutes}min old)`);
      });
    }

    // Get the most recent location for each driver
    const latestLocations = new Map();
    locations?.forEach(loc => {
      const existingLocation = latestLocations.get(loc.user_id);
      if (!existingLocation || new Date(loc.updated_at) > new Date(existingLocation.updated_at)) {
        latestLocations.set(loc.user_id, loc);
      }
    });

    console.log(`📍 Latest locations mapped for ${latestLocations.size} drivers`);

    // Filter drivers by proximity
    console.log('🎯 Filtering drivers by proximity...');
    const nearbyDrivers = drivers.filter(driver => {
      const location = latestLocations.get(driver.user_id);
      if (!location) {
        console.log(`❌ No location data for driver ${driver.user_id}`);
        return false;
      }

      // Check if location is recent (within last 15 minutes - increased for testing)
      const locationAge = Date.now() - new Date(location.updated_at).getTime();
      const ageMinutes = Math.round(locationAge / (1000 * 60));
      if (locationAge > 30 * 60 * 1000) { // Increased to 30 minutes for better coverage
        console.log(`❌ Location too old for driver ${driver.user_id}: ${ageMinutes} minutes (max 30)`);
        return false;
      }

      // Calculate distance
      const distance = calculateDistance(
        pickupLat,
        pickupLng,
        location.latitude,
        location.longitude
      );

      console.log(`📏 Driver ${driver.user_id} is ${distance.toFixed(1)}km away`);
      return distance <= radiusKm;
    });

    console.log(`🎯 Filtered ${nearbyDrivers.length} drivers within radius`);
    console.log(`✅ Found ${nearbyDrivers.length} drivers within ${radiusKm}km radius`);
    return nearbyDrivers.map(driver => ({
      ...driver,
      location: latestLocations.get(driver.user_id)
    }));

  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    return [];
  }
}

async function sendDriverNotification(supabase: any, driver: any, ride: any): Promise<boolean> {
  try {
    console.log(`📤 Creating notification for driver ${driver.user_id}`);
    console.log(`📤 Driver details:`, {
      id: driver.id,
      user_id: driver.user_id,
      status: driver.status,
      vehicle_type: driver.vehicles?.vehicle_type
    });

    // Calculate distance for notification
    const distance = calculateDistance(
      ride.pickup_latitude,
      ride.pickup_longitude,
      driver.location.latitude,
      driver.location.longitude
    );

    // Create notification record
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: driver.user_id,
        type: 'ride_request',
        title: 'New Ride Request',
        message: `Customer needs a ride from ${ride.pickup_address} to ${ride.destination_address} (${distance.toFixed(1)}km away)`,
        status: 'unread',
        data: {
          // CRITICAL: Ensure ride_id is always included
          ride_id: ride.id,
          ride_code: ride.ride_code,
          pickup_address: ride.pickup_address,
          destination_address: ride.destination_address,
          fare_amount: ride.fare_amount,
          booking_type: ride.booking_type,
          vehicle_type: ride.vehicle_type,
          distance: distance.toFixed(1),
          pickup_latitude: ride.pickup_latitude,
          pickup_longitude: ride.pickup_longitude,
          destination_latitude: ride.destination_latitude,
          destination_longitude: ride.destination_longitude,
          customer_id: ride.customer_id,
          customer_name: ride.customer?.full_name,
          customer_phone: ride.customer?.phone_number,
          created_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          notification_id: crypto.randomUUID()
          // Double-check: ride_id should be here
        }
      })
      .select()
      .single();

    if (notificationError) {
      console.error('❌ Error creating notification:', notificationError);
      console.error('❌ Failed notification data:', { user_id: driver.user_id, ride_id: ride.id });
      console.error('❌ Notification error details:', {
        code: notificationError.code,
        message: notificationError.message,
        details: notificationError.details
      });
      return false;
    }

    console.log('✅ Notification created successfully:', {
      id: notification.id,
      user_id: notification.user_id,
      ride_id: notification.data?.ride_id,
      type: notification.type,
      ride_id: notification.data?.ride_id
    });
    return true;

  } catch (error) {
    console.error('❌ Error sending driver notification:', error);
    console.error('❌ Full error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return false;
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