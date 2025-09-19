import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Platform } from 'react-native'
import { supabase, supabaseAdmin } from '../utils/supabase'
import { useAuth } from './AuthContext'
import { Database } from '../types/database'
import { RealtimeChannel } from '@supabase/supabase-js'
import { useRef } from 'react'
import { useLocation } from './LocationContext'
import { calculateDistance } from '../utils/maps'

type Ride = Database['public']['Tables']['rides']['Row'] & {
  customer?: {
    full_name: string
    phone_number: string
  }
}

type ScheduledBooking = Database['public']['Tables']['scheduled_bookings']['Row'] & {
  customer?: {
    full_name: string
    phone_number: string
  }
}

interface RideContextType {
  currentRide: Ride | null
  pendingRides: Ride[]
  assignedScheduledBooking: ScheduledBooking | null
  loading: boolean
  error: string | null
  acceptRide: (rideId: string) => Promise<boolean>
  declineRide: (rideId: string) => Promise<boolean>
  acceptScheduledBooking: (bookingId: string) => Promise<boolean>
  declineScheduledBooking: (bookingId: string) => Promise<boolean>
  markDriverArrived: (rideId: string) => Promise<boolean>
  generatePickupOTP: (rideId: string) => Promise<string | null>
  verifyPickupOTP: (rideId: string, otp: string) => Promise<boolean>
  startRide: (rideId: string) => Promise<boolean>
  generateDropOTP: (rideId: string) => Promise<string | null>
  completeRide: (rideId: string) => Promise<{ success: boolean; completionData?: any }>
  cancelRide: (rideId: string, reason: string) => Promise<boolean>
}

const RideContext = createContext<RideContextType>({} as RideContextType)

export const useRide = () => {
  const context = useContext(RideContext)
  if (!context) {
    throw new Error('useRide must be used within a RideProvider')
  }
  return context
}

interface RideProviderProps {
  children: ReactNode
}

// Notification manager class to handle ride polling
class RideNotificationManager {
  private authDriver: any = null
  private authLoading: boolean = true
  private pollingInterval: NodeJS.Timeout | null = null
  private realtimeChannel: RealtimeChannel | null = null
  private notificationChannel: RealtimeChannel | null = null
  private scheduledBookingChannel: RealtimeChannel | null = null
  private onRideUpdate: ((rides: Ride[]) => void) | null = null
  private onCurrentRideUpdate: ((ride: Ride | null) => void) | null = null
  private onAssignedScheduledBookingUpdate: ((booking: ScheduledBooking | null) => void) | null = null

  setDriver(driver: any, loading: boolean) {
    console.log('🔧 RideNotificationManager.setDriver called:', {
      driverStatus: driver?.status,
      loading
    })
    this.authDriver = driver
    this.authLoading = loading
  }

  setCallbacks(onRideUpdate: (rides: Ride[]) => void, onCurrentRideUpdate: (ride: Ride | null) => void) {
    this.onRideUpdate = onRideUpdate
    this.onCurrentRideUpdate = onCurrentRideUpdate
  }

  setScheduledBookingCallback(onAssignedScheduledBookingUpdate: (booking: ScheduledBooking | null) => void) {
    this.onAssignedScheduledBookingUpdate = onAssignedScheduledBookingUpdate
  }

  initialize() {
    console.log('🚀 RideNotificationManager.initialize called')
    
    // Set up real-time subscriptions
    this.setupRealtimeSubscriptions()
    
    // Set up polling as backup
    this.pollingInterval = setInterval(() => {
      this.checkForNewRides()
    }, 10000) // Poll every 10 seconds as backup
  }

  cleanup() {
    console.log('🧹 RideNotificationManager.cleanup called')
    
    // Clean up real-time subscriptions
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }
    
    if (this.notificationChannel) {
      supabase.removeChannel(this.notificationChannel)
      this.notificationChannel = null
    }
    
    if (this.scheduledBookingChannel) {
      supabase.removeChannel(this.scheduledBookingChannel)
      this.scheduledBookingChannel = null
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  private setupRealtimeSubscriptions() {
    if (!this.authDriver?.user_id) {
      console.log('❌ No driver user_id available for real-time subscriptions')
      return
    }

    console.log('🔔 Setting up real-time subscriptions for driver:', this.authDriver.user_id)

    // Subscribe to ride changes
    this.realtimeChannel = supabase
      .channel('ride-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rides',
          filter: `driver_id=eq.${this.authDriver.id}`
        },
        (payload) => {
          console.log('🔔 Real-time ride update received:', payload)
          this.handleRideUpdate(payload)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rides',
          filter: 'status=eq.requested'
        },
        (payload) => {
          console.log('🔔 New ride request detected:', payload)
          this.handleNewRideRequest(payload)
        }
      )
      .subscribe((status) => {
        console.log('🔔 Ride subscription status:', status)
      })

    // Subscribe to notifications
    this.notificationChannel = supabase
      .channel('driver-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${this.authDriver.user_id}`
        },
        (payload) => {
          console.log('🔔 Real-time notification received:', payload)
          this.handleNotificationUpdate(payload)
        }
      )
      .subscribe((status) => {
        console.log('🔔 Notification subscription status:', status)
      })

    // Subscribe to scheduled booking assignments
    this.scheduledBookingChannel = supabase
      .channel('scheduled-booking-assignments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_bookings',
          filter: `driver_id=eq.${this.authDriver.id}`
        },
        (payload) => {
          console.log('🔔 Scheduled booking update received:', payload)
          this.handleScheduledBookingUpdate(payload)
        }
      )
      .subscribe((status) => {
        console.log('🔔 Scheduled booking subscription status:', status)
      })
  }

  private async handleRideUpdate(payload: any) {
    try {
      console.log('🔄 Processing ride update:', payload.eventType, payload.new?.id)
      
      if (payload.eventType === 'UPDATE' && payload.new) {
        const rideId = payload.new.id
        
        // If this is our current ride, update it
        if (payload.new.driver_id === this.authDriver?.id) {
          await this.loadAssignedRide()
        }
      }
    } catch (error) {
      console.error('❌ Error handling ride update:', error)
    }
  }

  private async handleNewRideRequest(payload: any) {
    try {
      console.log('🚗 Processing new ride request:', payload.new?.id)
      
      if (payload.new && payload.new.status === 'requested' && !payload.new.driver_id) {
        // This is a new unassigned ride request
        console.log('🔔 New unassigned ride detected, checking if driver should be notified')
        
        // Check if this driver should be notified (based on proximity, vehicle type, etc.)
        await this.checkIfDriverShouldBeNotified(payload.new)
      }
    } catch (error) {
      console.error('❌ Error handling new ride request:', error)
    }
  }

  private async handleNotificationUpdate(payload: any) {
    try {
      console.log('📬 Processing notification update:', payload.new?.type)
      
      if (payload.new && payload.new.type === 'ride_request') {
        console.log('🚗 Ride request notification received via real-time')
        // Refresh pending rides
        await this.loadPendingRides()
      }
    } catch (error) {
      console.error('❌ Error handling notification update:', error)
    }
  }

  private async handleScheduledBookingUpdate(payload: any) {
    try {
      console.log('📅 Processing scheduled booking update:', payload.new?.id)
      await this.loadAssignedScheduledBooking()
    } catch (error) {
      console.error('❌ Error handling scheduled booking update:', error)
    }
  }

  private async checkIfDriverShouldBeNotified(rideData: any) {
    try {
      console.log('🎯 Checking if driver should be notified for ride:', rideData.id)
      
      // Call the edge function to check proximity and send notifications
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/driver-api/notify-drivers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ride_id: rideData.id
        })
      })

      const result = await response.json()
      console.log('📤 Notification result:', result)
      
    } catch (error) {
      console.error('❌ Error checking driver notification:', error)
    }
  }

  async checkForNewRides() {
    try {
      console.log('🔍 RideNotificationManager.checkForNewRides called')
      console.log('Auth state:', {
        hasDriver: !!this.authDriver,
        driverStatus: this.authDriver?.status,
        loading: this.authLoading
      })

      // Early return if still loading or no driver
      if (this.authLoading || !this.authDriver) {
        console.log('⏳ Skipping ride check - auth still loading or no driver')
        return
      }

      // Check for assigned rides regardless of status (for persistence)
      // Only skip if driver is offline
      if (this.authDriver.status === 'offline') {
        console.log('⏸️ Skipping ride check - driver offline')
        return
      }

      console.log('✅ Proceeding with ride check for driver:', this.authDriver.id)

      // Check for assigned ride first
      await this.loadAssignedRide()

      // Only check for pending rides if driver is online (not busy)
      if (this.authDriver.status === 'online') {
        await this.loadPendingRides()
      }

      // Check for assigned scheduled bookings
      await this.loadAssignedScheduledBooking()

    } catch (error) {
      console.error('❌ Exception in checkForNewRides:', error)
      console.error('❌ Exception details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
  }

  private async loadAssignedRide() {
    try {
      console.log('=== LOAD ASSIGNED RIDE DEBUG ===')
      console.log('🔍 Loading assigned ride for driver:', this.authDriver?.id)
      console.log('🔍 Driver status:', this.authDriver?.status)
      console.log('🔍 Driver verified:', this.authDriver?.is_verified)
      console.log('🔍 Timestamp:', new Date().toISOString())

      if (!this.authDriver?.id) {
        console.log('❌ No driver ID available for assigned ride check')
        if (this.onCurrentRideUpdate) {
          this.onCurrentRideUpdate(null)
        }
        return
      }

      // Validate Supabase configuration before making requests
      try {
        const testUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        if (!testUrl || testUrl === 'your_supabase_url_here' || testUrl === 'undefined') {
          console.error('❌ Supabase URL not configured properly');
          if (this.onCurrentRideUpdate) {
            this.onCurrentRideUpdate(null);
          }
          return;
        }
      } catch (configError) {
        console.error('❌ Supabase configuration error:', configError);
        return;
      }

      console.log('🔍 Querying database for assigned rides...')
      console.log('🔍 Query filters:')
      console.log('  - driver_id:', this.authDriver.id)
      console.log('  - status IN: [accepted, driver_arrived, in_progress]')
      console.log('  - booking_type IN: [regular, rental, outstation, airport]')
      
      // CRITICAL: Get assigned rides - include ALL active statuses for persistence
      // This ensures rides don't disappear during inactivity
      const { data: assignedRide, error: assignedError } = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .eq('driver_id', this.authDriver.id)
        .in('status', ['accepted', 'driver_arrived', 'in_progress'])
        .in('booking_type', ['regular', 'rental', 'outstation', 'airport'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (assignedError) {
        console.error('❌ Database error loading assigned ride:', assignedError)
        console.error('❌ Error code:', assignedError.code)
        console.error('❌ Error message:', assignedError.message)
        console.error('❌ Error details:', assignedError.details)
        
        if (assignedError.code !== 'PGRST116') {
          if (this.onCurrentRideUpdate) {
            this.onCurrentRideUpdate(null)
          }
          return
        }
      }

      console.log('=== ASSIGNED RIDE QUERY RESULT ===')
      if (assignedRide) {
        console.log('✅ RIDE PERSISTENCE CHECK: Found active ride in database')
        console.log('✅ Found assigned ride:', {
          id: assignedRide.id,
          ride_code: assignedRide.ride_code,
          status: assignedRide.status,
          booking_type: assignedRide.booking_type,
          vehicle_type: assignedRide.vehicle_type,
          driver_id: assignedRide.driver_id,
          customer_id: assignedRide.customer_id,
          pickup_address: assignedRide.pickup_address,
          destination_address: assignedRide.destination_address,
          created_at: assignedRide.created_at,
          updated_at: assignedRide.updated_at
        })
        console.log('✅ Customer info:', assignedRide.customer)
        console.log('✅ PERSISTENCE: This ride will remain visible until completed/cancelled')
      } else {
        console.log('❌ No assigned ride found for driver:', this.authDriver.id)
        console.log('❌ This means either:')
        console.log('  1. Driver has no active rides')
        console.log('  2. All rides are completed/cancelled')
        console.log('  3. Database query filters are too restrictive')
        console.log('  4. Driver ID mismatch')
      }
      
      console.log('🔄 Calling onCurrentRideUpdate with:', assignedRide ? 'ride data' : 'null')

      if (this.onCurrentRideUpdate) {
        this.onCurrentRideUpdate(assignedRide)
      }
      
      console.log('=== LOAD ASSIGNED RIDE COMPLETE ===')

    } catch (error) {
      console.error('=== EXCEPTION IN LOAD ASSIGNED RIDE ===')
      console.error('❌ Exception:', error.message || error)
      console.error('❌ Stack trace:', error.stack)
      console.error('❌ Driver ID:', this.authDriver?.id)
      console.error('❌ Timestamp:', new Date().toISOString())
      
      // Check if it's a network/fetch error
      if (error.message && error.message.includes('Failed to fetch')) {
        console.error('❌ NETWORK ERROR - check Supabase configuration and internet connection')
        console.error('❌ Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL)
      }
      
      if (this.onCurrentRideUpdate) {
        this.onCurrentRideUpdate(null)
      }
    }
  }

  private async loadPendingRides() {
    try {
      console.log('🔍 Loading pending rides for driver user:', this.authDriver?.user_id)

      if (!this.authDriver?.user_id) {
        console.log('❌ No driver user_id available for pending rides check')
        return
      }

      // Validate Supabase configuration before making requests
      try {
        const testUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        if (!testUrl || testUrl === 'your_supabase_url_here' || testUrl === 'undefined') {
          console.error('❌ Supabase URL not configured properly');
          if (this.onRideUpdate) {
            this.onRideUpdate([]);
          }
          return;
        }
      } catch (configError) {
        console.error('❌ Supabase configuration error:', configError);
        return;
      }

      // Get pending rides from notifications (exclude declined rides)
      console.log('📬 Fetching unread ride request notifications...')
      const { data: notifications, error: notificationError } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', this.authDriver.user_id)
        .eq('type', 'ride_request')
        .eq('status', 'unread')
        .order('created_at', { ascending: false })
        .limit(10)

      if (notificationError) {
        console.error('❌ Error loading notifications:', notificationError.message || notificationError)
        console.error('❌ Error details:', {
          code: notificationError.code,
          message: notificationError.message,
          details: notificationError.details
        })
        return
      }

      console.log('📬 Found notifications:', notifications?.length || 0)

      if (!notifications || notifications.length === 0) {
        console.log('📬 No unread ride request notifications found')
        if (this.onRideUpdate) {
          this.onRideUpdate([])
        }
        return
      }

      // Extract ride IDs from notifications
      const rideIds = notifications
        .map(n => n.data?.ride_id)
        .filter(Boolean)

      console.log('🔍 Ride IDs from notifications:', rideIds)

      if (rideIds.length === 0) {
        console.log('❌ No valid ride IDs found in notifications')
        if (this.onRideUpdate) {
          this.onRideUpdate([])
        }
        return
      }

      // Check for declined rides to exclude them
      console.log('🚫 Checking for previously declined rides...')
      const { data: declinedNotifications, error: declinedError } = await supabaseAdmin
        .from('notifications')
        .select('data')
        .eq('user_id', this.authDriver.user_id)
        .eq('type', 'ride_declined')
        .in('data->>ride_id', rideIds)

      const declinedRideIds = new Set(
        declinedNotifications?.map(n => n.data?.ride_id).filter(Boolean) || []
      )

      console.log('🚫 Previously declined ride IDs:', Array.from(declinedRideIds))

      // Filter out declined rides
      const availableRideIds = rideIds.filter(rideId => !declinedRideIds.has(rideId))
      console.log('✅ Available ride IDs (not declined):', availableRideIds)

      if (availableRideIds.length === 0) {
        console.log('❌ All rides have been previously declined by this driver')
        if (this.onRideUpdate) {
          this.onRideUpdate([])
        }
        return
      }

      // Get the actual ride data
      console.log('🔍 Fetching ride data for available rides...')
      const { data: pendingRides, error: ridesError } = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .in('id', availableRideIds)
        .eq('status', 'requested')
        .is('driver_id', null)

      if (ridesError) {
        console.error('❌ Error loading pending rides:', ridesError.message || ridesError)
        console.error('❌ Error details:', {
          code: ridesError.code,
          message: ridesError.message,
          details: ridesError.details
        })
        return
      }

      console.log('✅ Pending rides loaded (excluding declined):', pendingRides?.length || 0)
      if (pendingRides && pendingRides.length > 0) {
        pendingRides.forEach((ride, index) => {
          console.log(`Pending ride ${index + 1}:`, {
            id: ride.id,
            ride_code: ride.ride_code,
            status: ride.status,
            pickup: ride.pickup_address,
            customer: ride.customer?.full_name
          })
        })
      }

      if (this.onRideUpdate) {
        this.onRideUpdate(pendingRides || [])
      }

    } catch (error) {
      console.error('❌ Exception loading pending rides:', error.message || error)
      console.error('❌ Full error details:', error)
      
      // Check if it's a network/fetch error
      if (error.message && error.message.includes('Failed to fetch')) {
        console.error('❌ Network error - check Supabase configuration and internet connection')
        console.error('❌ Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL)
      }
    }
  }

  private async loadAssignedScheduledBooking() {
    try {
      console.log('🔍 Loading assigned scheduled booking for driver:', this.authDriver?.id)

      if (!this.authDriver?.id) {
        console.log('❌ No driver ID available for scheduled booking check')
        return
      }

      const { data: assignedBooking, error: bookingError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .eq('assigned_driver_id', this.authDriver.id)
        .eq('status', 'assigned')
        .order('scheduled_time', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (bookingError) {
        console.error('❌ Error loading assigned scheduled booking:', bookingError)
        return
      }

      console.log('✅ Assigned scheduled booking loaded:', assignedBooking ? assignedBooking.id : 'none')

      if (this.onAssignedScheduledBookingUpdate) {
        this.onAssignedScheduledBookingUpdate(assignedBooking)
      }

    } catch (error) {
      console.error('❌ Exception loading assigned scheduled booking:', error)
    }
  }
}

// Global instance
const rideNotificationManager = new RideNotificationManager()

export function RideProvider({ children }: RideProviderProps) {
  const { driver, loading, updateDriverStatusFromRide } = useAuth()
  const { currentLocation } = useLocation()
  const [currentRide, setCurrentRide] = useState<Ride | null>(null)
  const [pendingRides, setPendingRides] = useState<Ride[]>([])
  const [assignedScheduledBooking, setAssignedScheduledBooking] = useState<ScheduledBooking | null>(null)
  const [rideLoading, setRideLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastNotificationCheck, setLastNotificationCheck] = useState<Date>(new Date())
  const [tripStartTime, setTripStartTime] = useState<Date | null>(null)

  // Add the missing validation function
  const validateCompleteDriverProfile = async (driver: any): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('=== VALIDATING COMPLETE DRIVER PROFILE ===')
      console.log('Driver ID:', driver?.id)
      console.log('User ID:', driver?.user_id)
      console.log('Vehicle ID:', driver?.vehicle_id)

      if (!driver) {
        return { success: false, error: 'No driver data available' }
      }

      // Check if driver is verified
      if (!driver.is_verified) {
        return { success: false, error: 'Driver account is not verified' }
      }

      // Check user data
      if (!driver.user?.full_name) {
        return { success: false, error: 'Driver full name is missing' }
      }

      if (!driver.user?.phone_number) {
        return { success: false, error: 'Driver phone number is missing' }
      }

      // Check vehicle data
      if (!driver.vehicle) {
        return { success: false, error: 'No vehicle assigned to driver' }
      }

      if (!driver.vehicle.make || !driver.vehicle.model || !driver.vehicle.registration_number) {
        return { success: false, error: 'Vehicle information is incomplete' }
      }

      console.log('✅ Driver profile validation passed')
      return { success: true }

    } catch (error) {
      console.error('❌ Error validating driver profile:', error)
      return { success: false, error: 'Profile validation failed' }
    }
  }
  const [tripStartLocation, setTripStartLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [totalDistanceTraveled, setTotalDistanceTraveled] = useState<number>(0)
  const [lastKnownLocation, setLastKnownLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  // Track if notification manager has been initialized
  const managerInitialized = useRef(false)

  // Debug: Track current ride changes
  useEffect(() => {
    console.log('=== CURRENT RIDE STATE CHANGE ===')
    console.log('🔄 Current ride updated:', currentRide ? {
      id: currentRide.id,
      ride_code: currentRide.ride_code,
      status: currentRide.status,
      booking_type: currentRide.booking_type,
      driver_id: currentRide.driver_id,
      updated_at: currentRide.updated_at
    } : 'null')
    console.log('🔄 Timestamp:', new Date().toISOString())
    
    if (currentRide) {
      console.log('✅ RIDE IS VISIBLE IN UI')
      console.log('✅ Ride should appear in rides tab')
    } else {
      console.log('❌ NO CURRENT RIDE')
      console.log('❌ Rides tab will show "Ready for Rides" or "You\'re Offline"')
    }
  }, [currentRide])

  // Debug: Track pending rides changes
  useEffect(() => {
    console.log('=== PENDING RIDES STATE CHANGE ===')
    console.log('🔄 Pending rides count:', pendingRides.length)
    if (pendingRides.length > 0) {
      console.log('🔄 Pending rides:', pendingRides.map(ride => ({
        id: ride.id,
        ride_code: ride.ride_code,
        status: ride.status,
        pickup_address: ride.pickup_address
      })))
    }
    console.log('🔄 Timestamp:', new Date().toISOString())
  }, [pendingRides])

  // Initialize notification manager once on mount
  useEffect(() => {
    if (!managerInitialized.current) {
      console.log('=== RIDE NOTIFICATION MANAGER INITIALIZATION ===')
      console.log('🚀 Initializing RideNotificationManager for the first time')
      
      rideNotificationManager.setCallbacks(setPendingRides, setCurrentRide)
      rideNotificationManager.setScheduledBookingCallback(setAssignedScheduledBooking)
      rideNotificationManager.initialize()
      managerInitialized.current = true
      
      console.log('✅ RideNotificationManager initialized')
    }

    return () => {
      if (managerInitialized.current) {
        console.log('🧹 Cleaning up RideNotificationManager...')
        rideNotificationManager.cleanup()
        managerInitialized.current = false
      }
    }
  }, []) // Empty dependency array - initialize only once

  // Update notification manager with driver data when it changes
  useEffect(() => {
    console.log('=== UPDATING RIDE NOTIFICATION MANAGER ===')
    console.log('🔧 Updating RideNotificationManager with driver:', {
      hasDriver: !!driver?.id,
      driverId: driver?.id,
      driverUserId: driver?.user_id,
      driverStatus: driver?.status,
      loading,
      timestamp: new Date().toISOString()
    })

    // Always update the manager with current driver data
    rideNotificationManager.setDriver(driver, loading)
    rideNotificationManager.setCallbacks(setPendingRides, setCurrentRide)
    rideNotificationManager.setScheduledBookingCallback(setAssignedScheduledBooking)

    // Trigger a check for rides when driver becomes available or status changes
    if (!loading && driver?.id && managerInitialized.current) {
      console.log('✅ Driver data updated, checking for rides...')
      rideNotificationManager.checkForNewRides()
    } else {
      console.log('⏳ Waiting for driver data, still loading, or manager not initialized...')
    }
  }, [driver?.id, driver?.status, loading]) // Update when driver data changes

  // Add periodic check for missed notifications every 30 seconds
  useEffect(() => {
    if (!driver?.user_id || driver.status === 'offline') return

    const interval = setInterval(async () => {
      console.log('🔄 Periodic notification check...')
      await checkForMissedNotifications()
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [driver?.user_id, driver?.status])

  // Add periodic check for current ride persistence every 15 seconds
  useEffect(() => {
    if (!driver?.id) return

    const interval = setInterval(async () => {
      console.log('🔄 Periodic current ride persistence check...')
      await rideNotificationManager.checkForNewRides()
    }, 15000) // Check every 15 seconds

    return () => clearInterval(interval)
  }, [driver?.id])

  const checkForMissedNotifications = async () => {
    if (!driver?.user_id) return

    try {
      console.log('🔍 Checking for missed notifications since:', lastNotificationCheck.toISOString())
      
      // Check for notifications created after our last check
      const { data: missedNotifications, error } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', driver.user_id)
        .eq('type', 'ride_request')
        .eq('status', 'unread')
        .gte('created_at', lastNotificationCheck.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error checking missed notifications:', error)
        return
      }

      if (missedNotifications && missedNotifications.length > 0) {
        console.log(`📬 Found ${missedNotifications.length} missed notifications, processing...`)
        await processNewNotifications(missedNotifications)
      }
      
      // Update last check timestamp to prevent reprocessing
      setLastNotificationCheck(new Date())
    } catch (error) {
      console.error('❌ Exception checking missed notifications:', error)
    }
  }

  const processNewNotifications = async (notifications: any[]) => {
    try {
      console.log('📬 Processing new notifications:', notifications.length)
      
      // Extract ride IDs from notifications (support both formats)
      const rideIds = notifications
        .map(n => n.data?.ride_id || n.data?.rideId)
        .filter(Boolean)
      
      if (rideIds.length === 0) {
        console.log('❌ No valid ride IDs found in notifications')
        return
      }
      
      // Get ride data for these IDs
      const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .in('id', rideIds)
        .eq('status', 'requested')
        .is('driver_id', null)
      
      if (error) {
        console.error('❌ Error fetching rides from notifications:', error)
        return
      }
      
      if (rides && rides.length > 0) {
        console.log(`✅ Found ${rides.length} new rides from notifications`)
        
        // Merge with existing pending rides (avoid duplicates)
        setPendingRides(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newRides = rides.filter(r => !existingIds.has(r.id))
          return [...prev, ...newRides]
        })
      }
    } catch (error) {
      console.error('❌ Error processing new notifications:', error)
    }
  }

  // Track distance during active ride
  useEffect(() => {
    if (currentRide && currentRide.status === 'in_progress' && currentLocation && tripStartLocation) {
      const newLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude
      }

      if (lastKnownLocation) {
        const segmentDistance = calculateDistance(lastKnownLocation, newLocation)
        setTotalDistanceTraveled(prev => prev + segmentDistance)
        console.log('📏 Distance segment added:', segmentDistance.toFixed(3), 'km. Total:', (totalDistanceTraveled + segmentDistance).toFixed(2), 'km')
      }

      setLastKnownLocation(newLocation)
    }
  }, [currentLocation, currentRide?.status, tripStartLocation, lastKnownLocation, totalDistanceTraveled])

  const acceptRide = async (rideId: string): Promise<boolean> => {
    if (!driver?.id || !driver?.user_id) {
      console.error('❌ No driver available for ride acceptance')
      return false
    }

    try {
      console.log('=== ACCEPTING RIDE ===')
      console.log('🚗 Ride ID:', rideId)
      console.log('🚗 Driver ID:', driver.id)
      console.log('🚗 Driver User ID:', driver.user_id)
      
      // Debug: Run the exact SQL queries you specified
      console.log('=== RUNNING DEBUG QUERIES ===')
      
      // Check Driver Record
      console.log('🔍 Debug Query 1: Check Driver Record')
      const { data: debugDriver, error: debugDriverError } = await supabaseAdmin
        .from('drivers')
        .select('*')
        .eq('id', driver.id)
        .single()
      
      if (debugDriverError) {
        console.error('❌ Debug Query 1 Failed:', debugDriverError)
      } else {
        console.log('✅ Debug Query 1 Result:', debugDriver)
      }
      
      // Check User Record
      if (debugDriver?.user_id) {
        console.log('🔍 Debug Query 2: Check User Record')
        const { data: debugUser, error: debugUserError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', debugDriver.user_id)
          .single()
        
        if (debugUserError) {
          console.error('❌ Debug Query 2 Failed:', debugUserError)
        } else {
          console.log('✅ Debug Query 2 Result:', debugUser)
        }
      }
      
      // Check Vehicle Record
      if (debugDriver?.vehicle_id) {
        console.log('🔍 Debug Query 3: Check Vehicle Record')
        const { data: debugVehicle, error: debugVehicleError } = await supabaseAdmin
          .from('vehicles')
          .select('*')
          .eq('id', debugDriver.vehicle_id)
          .single()
        
        if (debugVehicleError) {
          console.error('❌ Debug Query 3 Failed:', debugVehicleError)
        } else {
          console.log('✅ Debug Query 3 Result:', debugVehicle)
        }
      }
      
      // Step 1: Validate complete driver profile BEFORE attempting ride acceptance
      console.log('🔍 Step 1: Validating complete driver profile...')
      const profileValidation = await validateCompleteDriverProfile(driver)
      
      if (!profileValidation.success) {
        console.error('❌ Driver profile validation failed:', profileValidation.error)
        console.error('❌ Cannot accept ride without complete profile')
        return false
      }
      // Step 1: Basic driver validation
      console.log('📋 Step 1: Validating driver profile...')
      if (!driver.is_verified) {
        console.error('❌ Driver is not verified')
        return false
      }
      if (!driver.user?.full_name || !driver.user?.phone_number) {
        console.error('❌ Driver missing required user information')
        return false
      }
      console.log('✅ Basic driver validation passed')
      
      // Step 2: Start location sharing BEFORE ride acceptance
      console.log('📍 Step 2: Starting location sharing...')
      const locationShared = await startLocationSharing()
      
      if (!locationShared) {
        console.error('❌ Failed to start location sharing')
        return false
      }
      
      console.log('✅ Location sharing started successfully')
      
      // Step 3: Atomic ride update with race condition protection
      console.log('🔄 Step 3: Performing atomic ride update...')
      const { data: updatedRide, error: rideError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'accepted', // Exactly 'accepted', not 'assigned'
          driver_id: driver.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('status', 'requested') // Only accept if still requested
        .is('driver_id', null) // Only accept if no driver assigned
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            id,
            full_name,
            phone_number,
            email
          )
        `)
        .single()
      
      if (rideError) {
        console.error('❌ Error updating ride:', rideError)
        if (rideError.code === 'PGRST116') {
          console.error('❌ Ride already taken by another driver or no longer available')
          return false
        }
        console.error('❌ Database error during ride acceptance')
        return false
      }
      
      if (!updatedRide) {
        console.error('❌ Ride update returned no data - likely already taken')
        return false
      }
      
      console.log('✅ Ride updated successfully to status:', updatedRide.status)
      console.log('✅ Driver assigned:', updatedRide.driver_id)
      
      // Step 4: Update driver status to busy (non-critical)
      console.log('🔄 Step 4: Updating driver status to busy...')
      try {
        await updateDriverStatus('busy')
        console.log('✅ Driver status updated to busy')
      } catch (statusError) {
        console.warn('⚠️ Failed to update driver status (non-critical):', statusError)
      }
      
      // Step 5: Update local state immediately
      console.log('🔄 Step 5: Updating local state...')
      setCurrentRide(updatedRide)
      setPendingRides(prev => prev.filter(r => r.id !== rideId))
      
      console.log('✅ RIDE ACCEPTANCE COMPLETED SUCCESSFULLY')
      console.log('✅ Ride status:', updatedRide.status)
      console.log('✅ Driver ID:', updatedRide.driver_id)
      console.log('✅ Customer:', updatedRide.customer?.full_name)
      
      return true
      
    } catch (error) {
      console.error('❌ Exception during ride acceptance:', error)
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      return false
    }
  }

  const declineRide = async (rideId: string): Promise<boolean> => {
    if (!driver?.user_id) {
      setError('Driver not available')
      return false
    }

    try {
      console.log('=== DECLINING RIDE ===')
      console.log('❌ Declining ride:', rideId, 'for driver:', driver.user_id)
      console.log('❌ This ride should NOT appear again for this driver')

      // Mark notification as cancelled (declined by driver)
      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .update({ status: 'cancelled' })
        .eq('user_id', driver.user_id)
        .eq('type', 'ride_request')
        .contains('data', { ride_id: rideId })

      if (notificationError) {
        console.error('❌ Error updating notification status:', notificationError)
      } else {
        console.log('✅ Notification marked as cancelled (declined)')
      }

      // Create a decline record to prevent this ride from being offered again
      const { error: declineError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: driver.user_id,
          type: 'ride_declined',
          title: 'Ride Declined',
          message: `You declined ride ${rideId}`,
          status: 'read',
          data: {
            ride_id: rideId,
            declined_at: new Date().toISOString(),
            declined_by: driver.user_id
          }
        })

      if (declineError) {
        console.error('❌ Error creating decline record:', declineError)
      } else {
        console.log('✅ Decline record created - ride will not be offered again')
      }

      // Remove from pending rides
      console.log('🗑️ Removing ride from pending rides list...')
      setPendingRides(prev => prev.filter(ride => ride.id !== rideId))
      console.log('✅ Ride removed from pending list - will not appear again')

      return true
    } catch (error) {
      console.error('❌ Exception declining ride:', error)
      setError('Failed to decline ride')
      return false
    }
  }

  const acceptScheduledBooking = async (bookingId: string): Promise<boolean> => {
    if (!driver?.id) {
      setError('Driver not available')
      return false
    }

    try {
      setRideLoading(true)
      console.log('📅 Accepting scheduled booking:', bookingId)

      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          assigned_driver_id: driver.id,
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .single()

      if (updateError) {
        console.error('❌ Error accepting scheduled booking:', updateError)
        setError('Failed to accept scheduled booking')
        return false
      }

      console.log('✅ Scheduled booking accepted successfully:', updatedBooking.id)
      setAssignedScheduledBooking(updatedBooking)

      return true
    } catch (error) {
      console.error('❌ Exception accepting scheduled booking:', error)
      setError('Failed to accept scheduled booking')
      return false
    } finally {
      setRideLoading(false)
    }
  }

  const declineScheduledBooking = async (bookingId: string): Promise<boolean> => {
    try {
      console.log('❌ Declining scheduled booking:', bookingId)

      const { error: updateError } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          assigned_driver_id: null,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)

      if (updateError) {
        console.error('❌ Error declining scheduled booking:', updateError)
        setError('Failed to decline scheduled booking')
        return false
      }

      console.log('✅ Scheduled booking declined successfully')
      setAssignedScheduledBooking(null)

      return true
    } catch (error) {
      console.error('❌ Exception declining scheduled booking:', error)
      setError('Failed to decline scheduled booking')
      return false
    }
  }

  const markDriverArrived = async (rideId: string): Promise<boolean> => {
    try {
      setRideLoading(true)
      console.log('=== MARK DRIVER ARRIVED DEBUG ===')
      console.log('📍 Marking driver arrived for ride:', rideId)
      console.log('📍 Current ride status before update:', currentRide?.status)
      console.log('📍 Timestamp:', new Date().toISOString())

      const { data: updatedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'driver_arrived',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .single()

      if (updateError) {
        console.error('❌ Database error marking driver arrived:', updateError)
        console.error('❌ Error details:', updateError)
        setError('Failed to update ride status')
        return false
      }

      console.log('=== DRIVER ARRIVED STATUS UPDATED ===')
      console.log('✅ Ride ID:', updatedRide.id)
      console.log('✅ New status:', updatedRide.status)
      console.log('✅ Updated at:', updatedRide.updated_at)
      console.log('✅ Updating current ride state...')
      setCurrentRide(updatedRide)
      console.log('✅ Current ride state updated - ride should remain visible')
      return true
    } catch (error) {
      console.error('=== EXCEPTION IN MARK DRIVER ARRIVED ===')
      console.error('❌ Exception:', error.message || error)
      console.error('❌ Stack trace:', error.stack)
      setError('Failed to update ride status')
      return false
    } finally {
      setRideLoading(false)
    }
  }

  const generatePickupOTP = async (rideId: string): Promise<string | null> => {
    try {
      console.log('🔐 Generating pickup OTP for ride:', rideId)

      const otp = Math.floor(1000 + Math.random() * 9000).toString()

      const { error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          pickup_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (updateError) {
        console.error('❌ Error generating pickup OTP:', updateError)
        setError('Failed to generate OTP')
        return null
      }

      console.log('✅ Pickup OTP generated successfully')
      return otp
    } catch (error) {
      console.error('❌ Exception generating pickup OTP:', error)
      setError('Failed to generate OTP')
      return null
    }
  }

  const verifyPickupOTP = async (rideId: string, otp: string): Promise<boolean> => {
    try {
      setRideLoading(true)
      console.log('🔍 Verifying pickup OTP for ride:', rideId)

      const { data: ride, error: fetchError } = await supabaseAdmin
        .from('rides')
        .select('pickup_otp')
        .eq('id', rideId)
        .single()

      if (fetchError || !ride) {
        console.error('❌ Error fetching ride for OTP verification:', fetchError)
        setError('Failed to verify OTP')
        return false
      }

      if (ride.pickup_otp !== otp) {
        console.error('❌ OTP verification failed - incorrect OTP')
        setError('Incorrect OTP')
        return false
      }

      // Start the ride
      const { data: updatedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'in_progress',
          pickup_otp: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .single()

      if (updateError) {
        console.error('❌ Error starting ride after OTP verification:', updateError)
        setError('Failed to start ride')
        return false
      }

      // Initialize trip tracking
      const startTime = new Date()
      const startLocation = currentLocation ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude
      } : null

      setTripStartTime(startTime)
      setTripStartLocation(startLocation)
      setTotalDistanceTraveled(0)
      setLastKnownLocation(startLocation)

      console.log('🚀 Trip tracking initialized:', {
        startTime: startTime.toISOString(),
        startLocation,
        rideId
      })

      console.log('✅ Pickup OTP verified and ride started')
      setCurrentRide(updatedRide)
      return true
    } catch (error) {
      console.error('❌ Exception verifying pickup OTP:', error)
      setError('Failed to verify OTP')
      return false
    } finally {
      setRideLoading(false)
    }
  }

  const startRide = async (rideId: string): Promise<boolean> => {
    try {
      setRideLoading(true)
      console.log('=== START RIDE DEBUG ===')
      console.log('🚀 Starting ride:', rideId)
      console.log('🚀 Current ride status before start:', currentRide?.status)
      console.log('🚀 Timestamp:', new Date().toISOString())

      const { data: updatedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .single()

      if (updateError) {
        console.error('❌ Database error starting ride:', updateError)
        console.error('❌ Error details:', updateError)
        setError('Failed to start ride')
        return false
      }

      console.log('=== RIDE STARTED SUCCESSFULLY ===')
      console.log('✅ Ride ID:', updatedRide.id)
      console.log('✅ New status:', updatedRide.status)
      console.log('✅ Updated at:', updatedRide.updated_at)
      console.log('✅ Updating current ride state...')
      setCurrentRide(updatedRide)
      console.log('✅ Current ride state updated - ride should remain visible')
      return true
    } catch (error) {
      console.error('=== EXCEPTION IN START RIDE ===')
      console.error('❌ Exception:', error.message || error)
      console.error('❌ Stack trace:', error.stack)
      setError('Failed to start ride')
      return false
    } finally {
      setRideLoading(false)
    }
  }

  const generateDropOTP = async (rideId: string): Promise<string | null> => {
    try {
      console.log('🔐 Generating drop OTP for ride:', rideId)

      const otp = Math.floor(1000 + Math.random() * 9000).toString()

      const { error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          drop_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (updateError) {
        console.error('❌ Error generating drop OTP:', updateError)
        setError('Failed to generate drop OTP')
        return null
      }

      console.log('✅ Drop OTP generated successfully')
      return otp
    } catch (error) {
      console.error('❌ Exception generating drop OTP:', error)
      setError('Failed to generate drop OTP')
      return null
    }
  }

  const completeRide = async (rideId: string): Promise<{ success: boolean; completionData?: any }> => {
    try {
      console.log('🚨 COMPLETE RIDE FUNCTION CALLED!')
      console.log('🚨 Ride ID:', rideId)
      console.log('🚨 Driver ID:', driver?.id)
      
      setRideLoading(true)

      // Calculate actual trip duration and distance
      const endTime = new Date()
      const actualDuration = tripStartTime ? Math.round((endTime.getTime() - tripStartTime.getTime()) / (1000 * 60)) : 25 // minutes
      const actualDistance = totalDistanceTraveled > 0 ? totalDistanceTraveled : 5.2 // km

      console.log('📊 Trip completion metrics:', {
        startTime: tripStartTime?.toISOString(),
        endTime: endTime.toISOString(),
        actualDuration: actualDuration + ' minutes',
        actualDistance: actualDistance.toFixed(2) + ' km',
        totalDistanceTraveled: totalDistanceTraveled.toFixed(2) + ' km'
      })

      // Get current ride data for calculations
      const { data: rideData, error: fetchError } = await supabaseAdmin
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single()

      if (fetchError || !rideData) {
        console.error('❌ Error fetching ride data:', fetchError)
        setError('Failed to fetch ride data')
        return { success: false }
      }

      // Get fare matrix for this booking and vehicle type
      console.log('💰 Fetching fare matrix for:', {
        booking_type: rideData.booking_type,
        vehicle_type: rideData.vehicle_type
      })
      
      const { data: fareMatrix, error: fareError } = await supabaseAdmin
        .from('fare_matrix')
        .select('*')
        .eq('booking_type', rideData.booking_type)
        .eq('vehicle_type', rideData.vehicle_type)
        .eq('is_active', true)
        .single()

      if (fareError || !fareMatrix) {
        console.error('❌ Error fetching fare matrix:', fareError)
        setError('Fare calculation failed - no fare matrix found')
        return { success: false }
      }

      console.log('✅ Fare matrix loaded:', fareMatrix)

      // Calculate completion data based on booking type
      const distance = actualDistance
      const duration = actualDuration
      let totalFare = 0
      let fareBreakdown: any = {}

      if (rideData.booking_type === 'rental') {
        // Rental fare calculation
        const rentalHours = rideData.rental_hours || 4
        const hourlyRate = fareMatrix.hourly_rate || 150
        const hourlyFare = rentalHours * hourlyRate
        
        fareBreakdown = {
          base_fare: fareMatrix.base_fare,
          hourly_rate: hourlyRate,
          rental_hours: rentalHours,
          hourly_fare: hourlyFare,
          platform_fee: (hourlyFare * fareMatrix.platform_fee_percent) / 100,
          total_fare: fareMatrix.base_fare + hourlyFare + ((hourlyFare * fareMatrix.platform_fee_percent) / 100)
        }
        
        totalFare = fareBreakdown.total_fare
        console.log('💰 Rental fare calculated:', fareBreakdown)
        
      } else {
        // Regular/Airport/Outstation fare calculation
        const baseFare = fareMatrix.base_fare
        const perKmRate = fareMatrix.per_km_rate
        const perMinuteRate = fareMatrix.per_minute_rate || 0
        const distanceFare = distance * perKmRate
        const timeFare = duration * perMinuteRate
        const subtotal = baseFare + distanceFare + timeFare
        const platformFee = (subtotal * fareMatrix.platform_fee_percent) / 100
        const calculatedTotal = subtotal + platformFee
        
        // Apply minimum fare
        totalFare = Math.max(calculatedTotal, fareMatrix.minimum_fare)
        
        fareBreakdown = {
          base_fare: baseFare,
          distance_fare: distanceFare,
          time_fare: timeFare,
          platform_fee: platformFee,
          minimum_fare: fareMatrix.minimum_fare,
          total_fare: totalFare,
          per_km_rate: perKmRate,
          per_minute_rate: perMinuteRate
        }
        
        console.log('💰 Regular fare calculated:', fareBreakdown)
      }

      const completionData = {
        distance,
        duration,
        fareBreakdown,
        pickup_address: rideData.pickup_address,
        destination_address: rideData.destination_address,
        booking_type: rideData.booking_type,
        rental_hours: rideData.rental_hours
      }

      // Update ride status to completed
      const { data: updatedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'completed',
          fare_amount: totalFare,
          distance_km: actualDistance,
          duration_minutes: actualDuration,
          payment_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .single()

      if (updateError) {
        console.error('❌ Error completing ride:', updateError)
        setError('Failed to complete ride')
        return { success: false }
      }

      // Update driver status back to online
      if (driver?.id) {
        await supabaseAdmin
          .from('drivers')
          .update({ 
            status: 'online',
            total_rides: (driver.total_rides || 0) + 1
          })
          .eq('id', driver.id)
      }

      // Reset trip tracking
      setTripStartTime(null)
      setTripStartLocation(null)
      setTotalDistanceTraveled(0)
      setLastKnownLocation(null)

      console.log('✅ Ride completed successfully')
      console.log('✅ Ride will now move to history and disappear from current rides')
      setCurrentRide(null)

      // Update driver status back to online in local state immediately
      updateDriverStatusFromRide('online')
      console.log('✅ Driver status updated to ONLINE in UI')

      return { 
        success: true, 
        completionData: {
          ...completionData,
          distance: actualDistance,
          duration: actualDuration
        }
      }
    } catch (error) {
      console.error('❌ Exception completing ride:', error)
      setError('Failed to complete ride')
      return { success: false }
    } finally {
      setRideLoading(false)
    }
  }

  const cancelRide = async (rideId: string, reason: string): Promise<boolean> => {
    try {
      setRideLoading(true)
      console.log('❌ Cancelling ride:', rideId, 'Reason:', reason)

      const { data: updatedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'cancelled',
          cancelled_by: driver?.user_id,
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select()
        .single()

      if (updateError) {
        console.error('❌ Error cancelling ride:', updateError)
        setError('Failed to cancel ride')
        return false
      }

      // Update driver status back to online
      if (driver?.id) {
        await supabaseAdmin
          .from('drivers')
          .update({ status: 'online' })
          .eq('id', driver.id)
        
        // Update local state immediately
        updateDriverStatusFromRide('online')
        console.log('✅ Driver status updated to ONLINE after cancellation')
      }

      // Reset trip tracking
      setTripStartTime(null)
      setTripStartLocation(null)
      setTotalDistanceTraveled(0)
      setLastKnownLocation(null)

      console.log('✅ Ride cancelled successfully')
      console.log('✅ Cancelled ride will now move to history and disappear from current rides')
      setCurrentRide(null)
      return true
    } catch (error) {
      console.error('❌ Exception cancelling ride:', error)
      setError('Failed to cancel ride')
      return false
    } finally {
      setRideLoading(false)
    }
  }

  const refreshRides = async (): Promise<void> => {
    console.log('🔄 Manual refresh rides called')
    await rideNotificationManager.checkForNewRides()
  }

  const clearError = () => {
    setError(null)
  }

  // Helper function to validate driver profile completeness
  const validateDriverProfile = async (driverId: string): Promise<{
    isValid: boolean;
    missingFields: string[];
  }> => {
    try {
      console.log('🔍 Validating driver profile for ID:', driverId)
      
      const { data: driverProfile, error } = await supabaseAdmin
        .from('drivers')
        .select(`
          id,
          user_id,
          license_number,
          vehicle_id,
          is_verified,
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
            vehicle_type
          )
        `)
        .eq('id', driverId)
        .single()

      if (error || !driverProfile) {
        console.error('❌ Error fetching driver profile:', error)
        return { isValid: false, missingFields: ['driver_record'] }
      }

      const missingFields: string[] = []

      // Check user record
      if (!driverProfile.users) {
        missingFields.push('user_record')
      } else {
        if (!driverProfile.users.full_name) missingFields.push('full_name')
        if (!driverProfile.users.phone_number) missingFields.push('phone_number')
      }

      // Check vehicle record
      if (!driverProfile.vehicles) {
        missingFields.push('vehicle_record')
      } else {
        if (!driverProfile.vehicles.make) missingFields.push('vehicle_make')
        if (!driverProfile.vehicles.model) missingFields.push('vehicle_model')
        if (!driverProfile.vehicles.registration_number) missingFields.push('registration_number')
        if (!driverProfile.vehicles.color) missingFields.push('vehicle_color')
      }

      // Check driver verification
      if (!driverProfile.is_verified) {
        missingFields.push('driver_verification')
      }

      const isValid = missingFields.length === 0
      console.log('🔍 Profile validation result:', { isValid, missingFields })
      
      return { isValid, missingFields }

    } catch (error) {
      console.error('❌ Exception validating driver profile:', error)
      return { isValid: false, missingFields: ['validation_error'] }
    }
  }

  // Helper function to start location sharing
  const startLocationSharing = async (): Promise<boolean> => {
    if (!driver?.user_id || !currentLocation) {
      console.log('❌ Cannot start location sharing - missing driver user_id or location')
      return false
    }

    try {
      console.log('📍 Starting location sharing for driver:', driver.user_id)
      console.log('📍 Current location:', {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy
      })

      const locationData = {
        user_id: driver.user_id,
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        heading: currentLocation.coords.heading,
        speed: currentLocation.coords.speed,
        accuracy: currentLocation.coords.accuracy,
        updated_at: new Date().toISOString()
      }

      // Use upsert for insert or update operation
      const { error: upsertError } = await supabaseAdmin
        .from('live_locations')
        .upsert(locationData, {
          onConflict: 'user_id',
        })
        .select()

      if (upsertError) {
        console.error('❌ Error upserting location:', upsertError)
        
        // Fallback: try manual insert/update
        const { error: insertError } = await supabaseAdmin
          .from('live_locations')
          .insert(locationData)

        if (insertError) {
          // If insert fails, try update
          const { error: updateError } = await supabaseAdmin
            .from('live_locations')
            .update({
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              heading: locationData.heading,
              speed: locationData.speed,
              accuracy: locationData.accuracy,
              updated_at: locationData.updated_at
            })
            .eq('user_id', driver.user_id)

          if (updateError) {
            console.error('❌ Error updating location:', updateError)
            return false
          }
          console.log('✅ Location record updated successfully')
        } else {
          console.log('✅ Location record inserted successfully')
        }
      } else {
        console.log('✅ Location record upserted successfully')
      }

      console.log('✅ Location sharing started successfully')
      return true

    } catch (error) {
      console.error('❌ Exception starting location sharing:', error)
      return false
    }
  }

  const updateDriverStatus = async (status: string): Promise<void> => {
    if (!driver?.id) return

    try {
      const { error } = await supabaseAdmin
        .from('drivers')
        .update({ status })
        .eq('id', driver.id)

      if (error) {
        console.error('❌ Error updating driver status:', error)
        throw error
      }

      console.log('✅ Driver status updated to:', status)
    } catch (error) {
      console.error('❌ Exception updating driver status:', error)
      throw error
    }
  }

  const value = {
    currentRide,
    pendingRides,
    assignedScheduledBooking,
    loading: rideLoading,
    error,
    acceptRide,
    declineRide,
    acceptScheduledBooking,
    declineScheduledBooking,
    markDriverArrived,
    generatePickupOTP,
    verifyPickupOTP,
    startRide,
    generateDropOTP,
    completeRide,
    cancelRide,
    refreshRides,
    clearError
  }

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  )
}