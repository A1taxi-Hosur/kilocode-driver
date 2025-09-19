import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase, supabaseAdmin } from '../utils/supabase'
import { useAuth } from './AuthContext'
import { Database } from '../types/database'

type Ride = Database['public']['Tables']['rides']['Row'] & {
  customer?: Database['public']['Tables']['users']['Row']
}

type ScheduledBooking = Database['public']['Tables']['scheduled_bookings']['Row'] & {
  customer?: Database['public']['Tables']['users']['Row']
}

interface RideContextType {
  currentRide: Ride | null
  pendingRides: Ride[]
  scheduledBookings: ScheduledBooking[]
  loading: boolean
  error: string | null
  acceptRide: (rideId: string) => Promise<boolean>
  declineRide: (rideId: string) => Promise<boolean>
  markDriverArrived: (rideId: string) => Promise<boolean>
  generatePickupOTP: (rideId: string) => Promise<string | null>
  verifyPickupOTP: (rideId: string, otp: string) => Promise<boolean>
  startRide: (rideId: string) => Promise<boolean>
  generateDropOTP: (rideId: string) => Promise<string | null>
  completeRide: (rideId: string) => Promise<{ success: boolean; completionData?: any }>
  cancelRide: (rideId: string, reason: string) => Promise<boolean>
  refreshRides: () => Promise<void>
  clearError: () => void
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

class RideNotificationManager {
  private driver: any
  private setCurrentRide: (ride: Ride | null) => void
  private setPendingRides: (rides: Ride[]) => void
  private setScheduledBookings: (bookings: ScheduledBooking[]) => void
  private setError: (error: string | null) => void

  constructor(
    driver: any,
    setCurrentRide: (ride: Ride | null) => void,
    setPendingRides: (rides: Ride[]) => void,
    setScheduledBookings: (bookings: ScheduledBooking[]) => void,
    setError: (error: string | null) => void
  ) {
    this.driver = driver
    this.setCurrentRide = setCurrentRide
    this.setPendingRides = setPendingRides
    this.setScheduledBookings = setScheduledBookings
    this.setError = setError
  }

  async checkForNewRides() {
    if (!this.driver?.id) {
      console.log('❌ No driver available for ride checking')
      return
    }

    try {
      console.log('=== CHECKING FOR NEW RIDES ===')
      console.log('Driver ID:', this.driver.id)
      console.log('Driver Status:', this.driver.status)

      // Check for assigned ride
      await this.loadAssignedRide()
      
      // Check for assigned scheduled booking
      await this.loadAssignedScheduledBooking()
      
      // Check for pending notifications (only if online)
      if (this.driver.status === 'online') {
        await this.loadPendingRides()
      }
    } catch (error) {
      console.error('❌ Error in checkForNewRides:', error)
      this.setError('Failed to check for rides')
    }
  }

  async loadAssignedRide() {
    if (!this.driver?.id) return

    try {
      console.log('🔍 Loading assigned ride...')
      
      // Check if Supabase is properly configured - more comprehensive check
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || 
          !supabaseKey ||
          supabaseUrl.includes('your-project-ref') ||
          supabaseUrl.includes('placeholder') ||
          supabaseUrl === 'https://your-project-ref.supabase.co' ||
          supabaseKey.includes('your-anon-key') ||
          supabaseKey.includes('placeholder') ||
          supabaseKey === 'your-anon-key-here') {
        console.log('⚠️ Supabase not properly configured, skipping ride loading')
        console.log('Current URL:', supabaseUrl)
        console.log('Key available:', !!supabaseKey)
        this.setCurrentRide(null)
        return
      }

      const { data: assignedRides, error } = await supabaseAdmin
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
        .eq('driver_id', this.driver.id)
        .in('status', ['accepted', 'driver_arrived', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.error('❌ Error code:', error.code)
        console.error('❌ Error message:', error.message)
        console.error('❌ Error details:', error)
        return
      }

      if (assignedRides && assignedRides.length > 0) {
        console.log('✅ Found assigned ride:', assignedRides[0].id)
        this.setCurrentRide(assignedRides[0])
      } else {
        console.log('ℹ️ No assigned rides found')
        this.setCurrentRide(null)
      }
    } catch (error) {
      console.error('❌ Error details:', error)
      // Don't set error state for network issues, just log them
    }
  }

  async loadAssignedScheduledBooking() {
    if (!this.driver?.id) return

    try {
      console.log('🔍 Loading assigned scheduled booking...')
      
      // Check if Supabase is properly configured - more comprehensive check
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || 
          !supabaseKey ||
          supabaseUrl.includes('your-project-ref') ||
          supabaseUrl.includes('placeholder') ||
          supabaseUrl === 'https://your-project-ref.supabase.co' ||
          supabaseKey.includes('your-anon-key') ||
          supabaseKey.includes('placeholder') ||
          supabaseKey === 'your-anon-key-here') {
        console.log('⚠️ Supabase not properly configured, skipping scheduled booking loading')
        console.log('Current URL:', supabaseUrl)
        console.log('Key available:', !!supabaseKey)
        this.setScheduledBookings([])
        return
      }

      const { data: scheduledBookings, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            id,
            full_name,
            phone_number,
            email
          )
        `)
        .eq('assigned_driver_id', this.driver.id)
        .in('status', ['assigned', 'confirmed', 'driver_arrived', 'in_progress'])
        .order('scheduled_time', { ascending: true })

      if (error) {
        console.error('❌ Error loading assigned scheduled booking:', error)
        return
      }

      if (scheduledBookings && scheduledBookings.length > 0) {
        console.log('✅ Found scheduled bookings:', scheduledBookings.length)
        this.setScheduledBookings(scheduledBookings)
      } else {
        console.log('ℹ️ No assigned scheduled bookings found')
        this.setScheduledBookings([])
      }
    } catch (error) {
      console.error('❌ Error loading assigned scheduled booking:', error)
      // Don't set error state for network issues, just log them
    }
  }

  async loadPendingRides() {
    if (!this.driver?.user_id) return

    try {
      console.log('🔔 Loading pending ride notifications...')
      
      // Check if Supabase is properly configured - more comprehensive check
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || 
          !supabaseKey ||
          supabaseUrl.includes('your-project-ref') ||
          supabaseUrl.includes('placeholder') ||
          supabaseUrl === 'https://your-project-ref.supabase.co' ||
          supabaseKey.includes('your-anon-key') ||
          supabaseKey.includes('placeholder') ||
          supabaseKey === 'your-anon-key-here') {
        console.log('⚠️ Supabase not properly configured, skipping notifications loading')
        console.log('Current URL:', supabaseUrl)
        console.log('Key available:', !!supabaseKey)
        this.setPendingRides([])
        return
      }

      const { data: notifications, error } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', this.driver.user_id)
        .eq('type', 'ride_request')
        .eq('status', 'unread')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('❌ Error loading notifications:', error)
        return
      }

      if (notifications && notifications.length > 0) {
        console.log('🔔 Found pending notifications:', notifications.length)
        
        // Convert notifications to ride objects
        const pendingRideIds = notifications
          .map(n => n.data?.ride_id)
          .filter(Boolean)

        if (pendingRideIds.length > 0) {
          const { data: pendingRides, error: ridesError } = await supabaseAdmin
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
            .in('id', pendingRideIds)
            .eq('status', 'requested')
            .is('driver_id', null)

          if (!ridesError && pendingRides) {
            console.log('✅ Loaded pending rides:', pendingRides.length)
            this.setPendingRides(pendingRides)
          }
        }
      } else {
        console.log('ℹ️ No pending notifications found')
        this.setPendingRides([])
      }
    } catch (error) {
      console.error('❌ Error loading notifications:', error)
      // Don't set error state for network issues, just log them
    }
  }
}

export function RideProvider({ children }: RideProviderProps) {
  const [currentRide, setCurrentRide] = useState<Ride | null>(null)
  const [pendingRides, setPendingRides] = useState<Ride[]>([])
  const [scheduledBookings, setScheduledBookings] = useState<ScheduledBooking[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { driver } = useAuth()

  // Initialize notification manager
  const notificationManager = new RideNotificationManager(
    driver,
    setCurrentRide,
    setPendingRides,
    setScheduledBookings,
    setError
  )

  useEffect(() => {
    if (driver && (driver.status === 'online' || driver.status === 'busy')) {
      console.log('=== RIDE CONTEXT INITIALIZATION ===')
      console.log('Driver:', driver.user?.full_name)
      console.log('Status:', driver.status)
      
      // Initial load
      notificationManager.checkForNewRides()
      
      // Set up polling for new rides
      const interval = setInterval(() => {
        notificationManager.checkForNewRides()
      }, 30000) // Check every 30 seconds
      
      return () => clearInterval(interval)
    } else {
      // Clear rides when driver goes offline
      setCurrentRide(null)
      setPendingRides([])
      setScheduledBookings([])
    }
  }, [driver?.status, driver?.id])

  const acceptRide = async (rideId: string): Promise<boolean> => {
    if (!driver?.id) return false

    try {
      setLoading(true)
      console.log('=== ACCEPTING RIDE ===')
      console.log('Ride ID:', rideId)
      console.log('Driver ID:', driver.id)

      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          driver_id: driver.id,
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('status', 'requested')
        .is('driver_id', null)
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

      if (error) {
        console.error('❌ Error accepting ride:', error)
        setError('Failed to accept ride')
        return false
      }

      if (updatedRide) {
        console.log('✅ Ride accepted successfully')
        setCurrentRide(updatedRide)
        setPendingRides(prev => prev.filter(r => r.id !== rideId))
        
        // Update driver status to busy
        await supabaseAdmin
          .from('drivers')
          .update({ status: 'busy' })
          .eq('id', driver.id)
        
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Exception accepting ride:', error)
      setError('Failed to accept ride')
      return false
    } finally {
      setLoading(false)
    }
  }

  const declineRide = async (rideId: string): Promise<boolean> => {
    try {
      console.log('=== DECLINING RIDE ===')
      console.log('Ride ID:', rideId)
      
      // Remove from pending rides
      setPendingRides(prev => prev.filter(r => r.id !== rideId))
      
      // Mark notification as read
      if (driver?.user_id) {
        await supabaseAdmin
          .from('notifications')
          .update({ status: 'read' })
          .eq('user_id', driver.user_id)
          .eq('type', 'ride_request')
          .contains('data', { ride_id: rideId })
      }
      
      return true
    } catch (error) {
      console.error('❌ Error declining ride:', error)
      return false
    }
  }

  const markDriverArrived = async (rideId: string): Promise<boolean> => {
    try {
      setLoading(true)
      
      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'driver_arrived',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
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

      if (error) {
        console.error('❌ Error marking driver arrived:', error)
        setError('Failed to update ride status')
        return false
      }

      if (updatedRide) {
        setCurrentRide(updatedRide)
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Exception marking driver arrived:', error)
      setError('Failed to update ride status')
      return false
    } finally {
      setLoading(false)
    }
  }

  const generatePickupOTP = async (rideId: string): Promise<string | null> => {
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString()
      
      const { error } = await supabaseAdmin
        .from('rides')
        .update({
          pickup_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (error) {
        console.error('❌ Error generating pickup OTP:', error)
        setError('Failed to generate OTP')
        return null
      }

      return otp
    } catch (error) {
      console.error('❌ Exception generating pickup OTP:', error)
      setError('Failed to generate OTP')
      return null
    }
  }

  const verifyPickupOTP = async (rideId: string, otp: string): Promise<boolean> => {
    try {
      setLoading(true)
      
      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'in_progress',
          pickup_otp: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('pickup_otp', otp)
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

      if (error) {
        console.error('❌ Error verifying pickup OTP:', error)
        setError('Invalid OTP')
        return false
      }

      if (updatedRide) {
        setCurrentRide(updatedRide)
        return true
      }

      setError('Invalid OTP')
      return false
    } catch (error) {
      console.error('❌ Exception verifying pickup OTP:', error)
      setError('Failed to verify OTP')
      return false
    } finally {
      setLoading(false)
    }
  }

  const startRide = async (rideId: string): Promise<boolean> => {
    try {
      setLoading(true)
      
      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
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

      if (error) {
        console.error('❌ Error starting ride:', error)
        setError('Failed to start ride')
        return false
      }

      if (updatedRide) {
        setCurrentRide(updatedRide)
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Exception starting ride:', error)
      setError('Failed to start ride')
      return false
    } finally {
      setLoading(false)
    }
  }

  const generateDropOTP = async (rideId: string): Promise<string | null> => {
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString()
      
      const { error } = await supabaseAdmin
        .from('rides')
        .update({
          drop_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (error) {
        console.error('❌ Error generating drop OTP:', error)
        setError('Failed to generate OTP')
        return null
      }

      return otp
    } catch (error) {
      console.error('❌ Exception generating drop OTP:', error)
      setError('Failed to generate OTP')
      return null
    }
  }

  const completeRide = async (rideId: string): Promise<{ success: boolean; completionData?: any }> => {
    try {
      setLoading(true)
      console.log('🚨 COMPLETE RIDE FUNCTION CALLED')
      console.log('🚨 Ride ID:', rideId)
      
      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'completed',
          drop_otp: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
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

      if (error) {
        console.error('❌ Error completing ride:', error)
        setError('Failed to complete ride')
        return { success: false }
      }

      if (updatedRide) {
        console.log('✅ Ride completed successfully')
        setCurrentRide(null)
        
        // Update driver status back to online
        if (driver?.id) {
          await supabaseAdmin
            .from('drivers')
            .update({ status: 'online' })
            .eq('id', driver.id)
        }
        
        // Create completion data
        const completionData = {
          distance: updatedRide.distance_km || 0,
          duration: updatedRide.duration_minutes || 0,
          fareBreakdown: {
            base_fare: 50,
            distance_fare: (updatedRide.distance_km || 0) * 10,
            total_fare: updatedRide.fare_amount || 0,
            per_km_rate: 10,
          },
          pickup_address: updatedRide.pickup_address,
          destination_address: updatedRide.destination_address,
          booking_type: updatedRide.booking_type,
        }
        
        return { success: true, completionData }
      }

      return { success: false }
    } catch (error) {
      console.error('❌ Exception completing ride:', error)
      setError('Failed to complete ride')
      return { success: false }
    } finally {
      setLoading(false)
    }
  }

  const cancelRide = async (rideId: string, reason: string): Promise<boolean> => {
    try {
      setLoading(true)
      
      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_by: driver?.user_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select()
        .single()

      if (error) {
        console.error('❌ Error cancelling ride:', error)
        setError('Failed to cancel ride')
        return false
      }

      if (updatedRide) {
        setCurrentRide(null)
        
        // Update driver status back to online
        if (driver?.id) {
          await supabaseAdmin
            .from('drivers')
            .update({ status: 'online' })
            .eq('id', driver.id)
        }
        
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Exception cancelling ride:', error)
      setError('Failed to cancel ride')
      return false
    } finally {
      setLoading(false)
    }
  }

  const refreshRides = async (): Promise<void> => {
    console.log('🔄 Manual refresh rides called')
    await notificationManager.checkForNewRides()
  }

  const clearError = () => {
    setError(null)
  }

  const value = {
    currentRide,
    pendingRides,
    scheduledBookings,
    loading,
    error,
    acceptRide,
    declineRide,
    markDriverArrived,
    generatePickupOTP,
    verifyPickupOTP,
    startRide,
    generateDropOTP,
    completeRide,
    cancelRide,
    refreshRides,
    clearError,
  }

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  )
}