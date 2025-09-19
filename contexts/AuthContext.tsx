import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { Database } from '../types/database'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase, supabaseAdmin } from '../utils/supabase'

type Driver = Database['public']['Tables']['drivers']['Row'] & {
  user: Database['public']['Tables']['users']['Row']
  vehicle?: Database['public']['Tables']['vehicles']['Row']
}

interface AuthContextType {
  session: Session | null
  user: User | null
  driver: Driver | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  updateDriverStatus: (status: 'offline' | 'online' | 'busy') => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

const DRIVER_SESSION_KEY = 'driver_session'

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)

  // Helper function to convert base64 to base64url format
  const base64ToBase64Url = (base64: string): string => {
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
      console.log('=== INITIALIZING AUTHENTICATION ===')
      
      // First, check if Supabase client has an existing session
      console.log('🔍 Checking Supabase client session...')
      const { data: existingSession } = await supabase.auth.getSession()
      
      if (existingSession.session) {
        console.log('✅ Found existing Supabase session')
        console.log('Session user ID:', existingSession.session.user.id)
        
        // Try to load driver data for this session
        try {
          const { data: sessionDriverData, error: sessionDriverError } = await supabaseAdmin
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
                capacity
              )
            `)
            .eq('user_id', existingSession.session.user.id)
          
          if (!sessionDriverError && sessionDriverData && sessionDriverData.length > 0) {
            const driverRecord = sessionDriverData[0]
            console.log('✅ Found driver data for existing session')
            
            const sessionUser = {
              id: existingSession.session.user.id,
              email: existingSession.session.user.email || 'driver@example.com',
              role: 'driver',
              full_name: existingSession.session.user.user_metadata?.full_name || 'Driver',
              phone_number: existingSession.session.user.user_metadata?.phone_number || null,
              avatar_url: null,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            
            const completeDriver = {
              ...driverRecord,
              user: sessionUser,
              vehicle: driverRecord.vehicles
            }
            
            setUser(sessionUser as any)
            setDriver(completeDriver)
            setLoading(false)
            console.log('✅ Session restored from Supabase client')
            return
          }
        } catch (sessionError) {
          console.log('⚠️ Could not load driver data for session:', sessionError)
        }
      }
      
      // Check for stored driver session
      const storedSession = await AsyncStorage.getItem(DRIVER_SESSION_KEY)
      
      if (storedSession) {
        console.log('Found stored driver session')
        const sessionData = JSON.parse(storedSession)
        
        // Check if session is not too old (24 hours)
        const sessionAge = Date.now() - sessionData.timestamp
        if (sessionAge < 24 * 60 * 60 * 1000) {
          console.log('✅ Found valid stored session, but fetching CURRENT status from database...')
          
          // CRITICAL: Always fetch current status from database, never trust stored session status
          try {
            const { data: currentDriverData, error: driverError } = await supabaseAdmin
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
                  capacity
                )
              `)
              .eq('user_id', sessionData.user.id)
            
            if (driverError || !currentDriverData || currentDriverData.length === 0) {
              console.error('❌ Could not fetch current driver data:', driverError)
              // Fallback to stored session if database fails
              setUser(sessionData.user)
              setDriver(sessionData.driver)
            } else {
              console.log('=== CURRENT STATUS FROM DATABASE ===')
              console.log('📊 Database status:', currentDriverData[0].status)
              console.log('📊 Stored session status:', sessionData.driver.status)
              console.log('📊 Using DATABASE status (authoritative source)')
              
              // Use current database data with fresh status
              const freshDriverData = {
                ...currentDriverData[0],
                user: sessionData.user,
                vehicle: currentDriverData[0].vehicles
              }
              
              setUser(sessionData.user)
              setDriver(freshDriverData)
              
              console.log('✅ Session restored with CURRENT database status:', freshDriverData.status)
            }
          } catch (fetchError) {
            console.error('Error fetching current driver status:', fetchError)
            // Fallback to stored session
            setUser(sessionData.user)
            setDriver(sessionData.driver)
          }
          
          setLoading(false)
          return
        } else {
          console.log('Session expired, clearing...')
          await AsyncStorage.removeItem(DRIVER_SESSION_KEY)
        }
      }
      
      console.log('No existing session found')
      setLoading(false)
    } catch (error) {
      console.error('Error initializing auth:', error)
      setLoading(false)
    }
  }

  const signIn = async (username: string, password: string) => {
    try {
      console.log('=== DRIVER AUTHENTICATION ===')
      console.log('Username:', username)
      console.log('Password length:', password.length)
      console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL)
      
      setLoading(true)
      
      // Step 1: Find driver credentials
      console.log('🔍 Looking up driver credentials...')
      
      // First, let's see ALL credentials in the table (for debugging)
      console.log('🔍 Fetching ALL credentials for debugging...')
      try {
        // Use admin client to bypass RLS for authentication
        const client = supabaseAdmin || supabase
        const { data: allCreds, error: allError } = await client
          .from('driver_credentials')
          .select('id, username, created_at')
        
        if (allError) {
          console.error('❌ Error fetching all credentials:', allError)
          console.error('Error details:', {
            code: allError.code,
            message: allError.message,
            details: allError.details,
            hint: allError.hint
          })
        } else {
          console.log('✅ All credentials in table:', allCreds)
          console.log('Total credentials found:', allCreds?.length || 0)
          if (allCreds && allCreds.length > 0) {
            console.log('Available usernames:', allCreds.map(c => `"${c.username}"`))
          }
        }
      } catch (debugError) {
        console.error('Debug query failed:', debugError)
      }
      
      // Now try the specific query
      console.log('🔍 Looking for specific username:', `"${username}"`)
      const { data: credentials, error: credError } = await supabaseAdmin
        .from('driver_credentials')
        .select('*')
        .eq('username', username)
      
      console.log('Query result:', { data: credentials, error: credError })
      
      if (credError) {
        console.error('❌ Database error details:', {
          code: credError.code,
          message: credError.message,
          details: credError.details,
          hint: credError.hint
        })
        
        // If no rows found, show available usernames for debugging
        if (credError.code === 'PGRST116') {
          throw new Error('Invalid username or password')
        }
        
        throw new Error('Database connection failed')
      }
      
      // Handle array result (without .single())
      if (!credentials || credentials.length === 0) {
        console.error('❌ Username not found:', username)
        throw new Error('Invalid username or password')
      }
      
      // Get first result if it's an array
      const cred = Array.isArray(credentials) ? credentials[0] : credentials
      console.log('✅ Found credentials for username:', username)
      console.log('Credential ID:', cred.id)
      
      // Step 2: Verify password (simple comparison for now)
      console.log('🔐 Verifying password...')
      console.log('Stored password hash:', cred.password_hash)
      console.log('Provided password:', password)
      console.log('Passwords match:', cred.password_hash === password)
      
      if (cred.password_hash !== password) {
        console.error('❌ Password verification failed')
        throw new Error('Invalid username or password')
      }
      
      console.log('✅ Password verified')
      
      // Step 3: Get user data
      console.log('📋 Loading user profile...')
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', cred.user_id)
        .single()
      
      if (userError || !userData) {
        console.error('❌ User not found:', userError)
        throw new Error('User profile not found')
      }
      
      // Verify user is a driver
      if (userData.role !== 'driver') {
        console.error('❌ User is not a driver, role:', userData.role)
        throw new Error('Access denied. This app is for drivers only.')
      }
      
      console.log('✅ User verified as driver')
      
      // Step 4: Get CURRENT driver data with vehicle from database (FRESH DATA)
      console.log('🚗 Loading driver profile...')
      const { data: driverData, error: driverError } = await supabaseAdmin
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
            capacity
          )
        `)
        .eq('user_id', cred.user_id)
      
      if (driverError) {
        console.error('❌ Driver profile not found:', driverError)
        throw new Error('Driver profile not found')
      }
      
      if (!driverData || driverData.length === 0) {
        console.error('❌ No driver record found for user:', cred.user_id)
        throw new Error('Driver profile not found')
      }
      
      const driver = driverData[0]
      
      // Check if driver is verified
      if (!driver.is_verified) {
        console.error('❌ Driver not verified')
        throw new Error('Your driver account is pending verification. Please contact your administrator.')
      }
      
      // CRITICAL: Get the ACTUAL current status from database
      console.log('=== RETRIEVING CURRENT DRIVER STATUS ===')
      console.log('✅ Driver profile loaded successfully')
      console.log('📊 CURRENT status from database:', driver.status)
      console.log('📊 Status retrieved at:', new Date().toISOString())
      console.log('📊 TESTING MODE: Setting status to ONLINE by default')
      
      // FOR TESTING: Force status to online
      console.log('🧪 TESTING MODE ACTIVE - Ensuring driver is ONLINE and AVAILABLE')
      try {
        const { error: statusUpdateError } = await supabaseAdmin
          .from('drivers')
          .update({ 
            status: 'online',
            is_verified: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', driver.id)
        
        if (statusUpdateError) {
          console.error('❌ Error setting default online status:', statusUpdateError)
        } else {
          console.log('✅ Driver status set to ONLINE and VERIFIED for testing')
          driver.status = 'online' // Update local data
          driver.is_verified = true
        }
      } catch (error) {
        console.error('❌ Exception setting default status:', error)
      }
      
      // Step 5: Combine data
      const completeDriver = {
        ...driver,
        user: userData,
        vehicle: driver.vehicles
      }
      
      console.log('=== FINAL STATUS CONFIRMATION ===')
      console.log('📊 Driver logged in with TESTING status:', completeDriver.status)
      console.log('🧪 TESTING MODE: Driver defaulted to ONLINE')
      console.log('📊 Status will remain ONLINE until manually changed')
      
      // Step 6: Set state
      setUser(userData as any)
      setDriver(completeDriver)
      
      // Step 7: Store session
      await AsyncStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({
        user: userData,
        driver: completeDriver,
        timestamp: Date.now()
      }))
      
      console.log('✅ Authentication completed - LocationContext will handle location setup')
      
      setLoading(false)
      return { error: null }
      
    } catch (error) {
      console.error('❌ Sign in failed:', error)
      setLoading(false)
      return { error }
    }
  }

  const signOut = async () => {
    try {
      console.log('=== SIGNING OUT ===')
      console.log('📊 Current driver status before logout:', driver?.status)
      console.log('🔒 Status will be preserved in database - NOT changing to offline')
      
      // Clear session data
      await AsyncStorage.multiRemove([
        DRIVER_SESSION_KEY,
        '@supabase.auth.token',
        'supabase.auth.token'
      ])
      
      // Clear state
      setSession(null)
      setUser(null)
      setDriver(null)
      
      console.log('✅ Sign out completed - driver status preserved in database')
      
    } catch (error) {
      console.error('❌ Error during sign out:', error)
      throw error
    }
  }

  const updateDriverStatus = async (status: 'offline' | 'online' | 'busy') => {
    if (!driver) {
      console.log('No driver available for status update')
      return
    }

    // Check if this is actually a change or just a sync
    const isActualChange = driver.status !== status;
    const changeType = isActualChange ? 'MANUAL CHANGE' : 'SYNC UPDATE';

    try {
      console.log(`=== ${changeType} ===`)
      console.log('🔄 Updating driver status from:', driver.status, 'to:', status)
      console.log('📊 Change type:', changeType)
      console.log('📊 Database will be updated with new status')
      console.log('📊 Timestamp:', new Date().toISOString())
      console.log('📊 This change is PERMANENT and will persist across app sessions')
      console.log('📊 Status will remain', status, 'until explicitly changed again by user or ride lifecycle')
      
      // Only update database if this is an actual change
      if (isActualChange) {
        console.log('📊 WRITING TO DATABASE - This is the authoritative source of truth')
        
        // When going online, ensure driver is verified and available for customers
        const updateData: any = { 
          status,
          updated_at: new Date().toISOString()
        };
        
        if (status === 'online') {
          console.log('🟢 Driver going ONLINE - ensuring availability for customers');
          updateData.is_verified = true; // Ensure driver is verified when online
        }
        
        const { data: updatedData, error } = await supabaseAdmin
          .from('drivers')
          .update(updateData)
          .eq('id', driver.id)
          .select()
          .single()

        if (error) {
          console.error('Error updating driver status:', error)
          throw error
        }
        
        console.log('✅ Database updated successfully')
        console.log('✅ Updated driver data:', updatedData)
        console.log('✅ Status is now PERMANENTLY set to:', status)
        console.log('✅ No automatic processes will change this status')
        
        if (status === 'online') {
          console.log('✅ Driver is now VERIFIED and AVAILABLE for customer bookings')
        }
      } else {
        console.log('✅ No database update needed - syncing UI only')
      }

      console.log('✅ Driver status changed from', driver.status, 'to', status)
      if (isActualChange) {
        console.log('✅ This change will persist across app sessions')
        console.log('✅ Status will remain', status, 'indefinitely until next manual change')
      }
      console.log('✅ Status will remain', status, 'until manually changed again')
      
      // Update local state
      setDriver(prev => prev ? { 
        ...prev, 
        status,
        is_verified: status === 'online' ? true : prev.is_verified
      } : null)
      
      console.log('✅ Local state updated - UI will reflect new status')
      
      // Force refresh of ride notifications when status changes
      if (isActualChange && status === 'online') {
        console.log('🔄 Driver went online - forcing notification refresh')
        setTimeout(() => {
          // Trigger a manual check for pending rides
          console.log('🔄 Triggering manual ride check after status change')
        }, 2000)
      }
      
      // Update stored session to reflect new status
      if (isActualChange) {
        try {
          const sessionData = await AsyncStorage.getItem(DRIVER_SESSION_KEY)
          if (sessionData) {
            const parsed = JSON.parse(sessionData)
            parsed.driver.status = status
            if (status === 'online') {
              parsed.driver.is_verified = true
            }
            parsed.timestamp = Date.now()
            await AsyncStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(parsed))
            console.log('✅ Stored session updated with new status')
            console.log('✅ Status will persist even after app restart')
          }
        } catch (storageError) {
          console.error('⚠️ Failed to update stored session:', storageError)
        }
      } else {
        console.log('✅ Stored session unchanged - sync operation')
      }
    } catch (error) {
      console.error('Failed to update driver status:', error)
      throw error
    }
  }

  // New function to update driver status from ride context
  const updateDriverStatusFromRide = (status: 'offline' | 'online' | 'busy') => {
    console.log('🔄 Updating driver status from ride context:', status)
    setDriver(prev => prev ? { 
      ...prev, 
      status
    } : null)
  }
  const value = {
    session,
    user,
    driver,
    loading,
    signIn,
    signOut,
    updateDriverStatus,
    updateDriverStatusFromRide
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}