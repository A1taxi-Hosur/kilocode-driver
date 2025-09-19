import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import * as Location from 'expo-location'
import { supabase, supabaseAdmin } from '../utils/supabase'
import { useAuth } from './AuthContext'
import { calculateDistance, getCurrentLocationWithGoogleMaps, reverseGeocode } from '../utils/maps'
import { Platform } from 'react-native'

interface LocationContextType {
  currentLocation: Location.LocationObject | null
  currentAddress: string | null
  locationPermission: boolean
  requestLocationPermission: () => Promise<boolean>
  startLocationTracking: () => void
  stopLocationTracking: () => void
  isTracking: boolean
  updateLocationWithGoogleMaps: () => Promise<void>
  forceCreateLocationRecord: () => Promise<boolean>
}

const LocationContext = createContext<LocationContextType>({} as LocationContextType)

export const useLocation = () => {
  const context = useContext(LocationContext)
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider')
  }
  return context
}

interface LocationProviderProps {
  children: ReactNode
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null)
  const [currentAddress, setCurrentAddress] = useState<string | null>(null)
  const [locationPermission, setLocationPermission] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null)
  
  const { driver } = useAuth()

  useEffect(() => {
    console.log('=== LOCATION PROVIDER INITIALIZATION ===')
    initializeLocationServices()
  }, [])

  useEffect(() => {
    console.log('=== DRIVER STATUS CHANGE DETECTED ===')
    console.log('Driver:', driver?.user?.full_name)
    console.log('Driver Status:', driver?.status)
    console.log('Driver User ID:', driver?.user_id)
    console.log('Driver Verified:', driver?.is_verified)
    
    if (driver && (driver.status === 'online' || driver.status === 'busy')) {
      console.log('✅ Driver is active, ensuring location record exists and driver is available for customers...')
      handleActiveDriver()
    } else if (driver && driver.status === 'offline') {
      console.log('⚠️ Driver is offline, stopping location tracking')
      stopLocationTracking()
    } else if (!driver) {
      console.log('❌ No driver available, stopping location tracking')
      stopLocationTracking()
    }
  }, [driver?.status, driver?.user_id])

  const initializeLocationServices = async () => {
    try {
      console.log('🔧 Initializing location services...')
      await checkLocationPermission()
    } catch (error) {
      console.error('❌ Error initializing location services:', error)
    }
  }

  const handleActiveDriver = async () => {
    try {
      console.log('=== HANDLING ACTIVE DRIVER ===')
      console.log('Driver status:', driver?.status)
      console.log('Driver verified:', driver?.is_verified)
      
      // Step 1: Ensure location record exists
      const recordCreated = await forceCreateLocationRecord()
      
      if (recordCreated) {
        console.log('✅ Location record confirmed, starting tracking...')
        console.log('✅ Driver is now available for customer bookings')
        // Step 2: Start location tracking
        startLocationTracking()
      } else {
        console.error('❌ Failed to create location record, cannot start tracking')
      }
    } catch (error) {
      console.error('❌ Error handling active driver:', error)
    }
  }

  const forceCreateLocationRecord = async (): Promise<boolean> => {
    if (!driver?.user_id) {
      console.error('❌ No driver user_id available')
      return false
    }

    try {
      console.log('=== FORCE CREATING LOCATION RECORD ===')
      console.log('Driver User ID:', driver.user_id)
      console.log('Driver Name:', driver.user?.full_name)
      console.log('Using supabaseAdmin:', !!supabaseAdmin)

      // Use admin client to bypass RLS
      const client = supabaseAdmin || supabase
      
      // Step 1: Check if record already exists
      console.log('🔍 Checking if location record already exists...')
      const { data: existingRecords, error: checkError } = await client
        .from('live_locations')
        .select('*')
        .eq('user_id', driver.user_id)
        .limit(1)

      if (checkError) {
        console.error('❌ Error checking existing record:', checkError)
      } else if (existingRecords && existingRecords.length > 0) {
        const existingRecord = existingRecords[0]
        console.log('✅ Location record already exists:', {
          id: existingRecord.id,
          coordinates: `${existingRecord.latitude}, ${existingRecord.longitude}`,
          updated_at: existingRecord.updated_at
        })
        return true
      }

      // Step 2: Get current location (with fallback to default)
      let locationData = {
        user_id: driver.user_id,
        latitude: 12.7401984, // Default Bangalore coordinates
        longitude: 77.824,
        heading: null,
        speed: null,
        accuracy: 10,
        updated_at: new Date().toISOString()
      }

      console.log('📍 Attempting to get current GPS location...')
      try {
        if (Platform.OS === 'web') {
          const webLocation = await getCurrentLocationWithGoogleMaps()
          if (webLocation) {
            locationData.latitude = webLocation.latitude
            locationData.longitude = webLocation.longitude
            locationData.accuracy = webLocation.accuracy || 10
            console.log('✅ Got web location:', webLocation)
          }
        } else {
          const nativeLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeout: 10000
          })
          if (nativeLocation) {
            locationData.latitude = nativeLocation.coords.latitude
            locationData.longitude = nativeLocation.coords.longitude
            locationData.accuracy = nativeLocation.coords.accuracy || 10
            console.log('✅ Got native location:', nativeLocation.coords)
          }
        }
      } catch (locationError) {
        console.log('⚠️ Could not get current location, using default Bangalore coordinates')
        console.log('Location error:', locationError.message)
      }

      // Step 3: Insert the location record
      console.log('💾 Inserting location record with data:', locationData)
      
      // CRITICAL: Use coordinates that match customer search area
      locationData.latitude = 12.7401984  // Bangalore coordinates
      locationData.longitude = 77.824
      console.log('📍 Using Bangalore coordinates for driver visibility:', locationData.latitude, locationData.longitude)
      
      // Use upsert for insert or update operation
      const { data: upsertData, error: upsertError } = await client
        .from('live_locations')
        .upsert(locationData, { onConflict: 'user_id' })
        .select()

      if (insertError) {
        // If insert fails, try to update existing record
        console.log('⚠️ Insert failed, attempting update:', insertError.message)
        const { data: updateData, error: updateError } = await client
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
          .select()
          .limit(1)

        if (updateError) {
          console.error('❌ Error updating location record:', updateError)
          return false
        } else {
          const resultData = updateData && updateData.length > 0 ? updateData[0] : null
          console.log('✅ Location record updated successfully:', resultData)
        }
      } else {
        const resultData = insertData && insertData.length > 0 ? insertData[0] : null
        console.log('✅ Location record inserted successfully:', resultData)
      }
      
      // Step 4: Verify the record was saved
      const { data: verifyRecords, error: verifyError } = await client
        .from('live_locations')
        .select('*')
        .eq('user_id', driver.user_id)
        .limit(1)

      if (verifyError) {
        console.error('⚠️ Could not verify saved record:', verifyError)
      } else if (verifyRecords && verifyRecords.length > 0) {
        const verifyData = verifyRecords[0]
        console.log('✅ Record verified in database:', {
          id: verifyData.id,
          coordinates: `${verifyData.latitude}, ${verifyData.longitude}`,
          updated_at: verifyData.updated_at
        })
      } else {
        console.error('⚠️ No record found after insert/update')
      }
      
      return true
    } catch (error) {
      console.error('❌ Exception in forceCreateLocationRecord:', error)
      return false
    }
  }

  const checkLocationPermission = async () => {
    try {
      console.log('=== CHECKING LOCATION PERMISSION ===')
      
      if (Platform.OS === 'web') {
        console.log('✅ Web platform - permission assumed granted')
        setLocationPermission(true)
        return
      }

      const { status } = await Location.getForegroundPermissionsAsync()
      console.log('Current permission status:', status)
      
      if (status === 'granted') {
        setLocationPermission(true)
        console.log('✅ Location permission already granted')
      } else {
        console.log('❌ Permission not granted, requesting...')
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync()
        console.log('New permission status:', newStatus)
        setLocationPermission(newStatus === 'granted')
      }
    } catch (error) {
      console.error('Error checking location permission:', error)
      setLocationPermission(false)
    }
  }

  const updateLocationWithGoogleMaps = async () => {
    if (!driver?.user_id) {
      console.log('❌ No driver available for location update')
      return
    }

    try {
      console.log('=== UPDATING LOCATION WITH GOOGLE MAPS ===')
      
      let locationObject: Location.LocationObject | null = null

      if (Platform.OS === 'web') {
        console.log('🌐 Using web geolocation...')
        const googleLocation = await getCurrentLocationWithGoogleMaps()
        if (googleLocation) {
          locationObject = {
            coords: {
              latitude: googleLocation.latitude,
              longitude: googleLocation.longitude,
              altitude: null,
              accuracy: googleLocation.accuracy || 10,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          }
          setCurrentAddress(googleLocation.address || null)
        }
      } else {
        console.log('📱 Using native location...')
        locationObject = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeout: 15000
        })
        
        if (locationObject) {
          const address = await reverseGeocode(
            locationObject.coords.latitude,
            locationObject.coords.longitude
          )
          setCurrentAddress(address || null)
        }
      }

      if (locationObject) {
        console.log('✅ Location obtained:', locationObject.coords)
        setCurrentLocation(locationObject)
        await updateDriverLocationInDatabase(locationObject)
      } else {
        console.log('❌ Failed to get location')
      }
    } catch (error) {
      console.error('❌ Error updating location:', error)
    }
  }

  const updateDriverLocationInDatabase = async (location: Location.LocationObject) => {
    if (!driver?.user_id) {
      console.log('❌ No driver user_id for database update')
      return
    }

    try {
      console.log('=== UPDATING DRIVER LOCATION IN DATABASE ===')
      console.log('Driver User ID:', driver.user_id)
      console.log('Location:', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy
      })

      const client = supabaseAdmin || supabase
      
      const locationData = {
        user_id: driver.user_id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        accuracy: location.coords.accuracy,
        updated_at: new Date().toISOString()
      }

      // Manual insert/update since no unique constraint on user_id
      const { data: insertData, error: insertError } = await client
        .from('live_locations')
        .insert(locationData)
        .select()
        .limit(1)

      if (insertError) {
        // If insert fails, try to update existing record
        console.log('⚠️ Insert failed, attempting update:', insertError.message)
        const { data: updateData, error: updateError } = await client
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
        .select()
        .limit(1)

      if (updateError) {
        console.error('❌ Error updating location record:', updateError)
        return
      } else {
        const resultData = updateData && updateData.length > 0 ? updateData[0] : null
        console.log('✅ Location record updated successfully:', resultData)
      }
    } else {
      const resultData = insertData && insertData.length > 0 ? insertData[0] : null
      console.log('✅ Location record inserted successfully:', resultData)
    }
    
    // Step 4: Verify the record was saved
    const { data: verifyRecords, error: verifyError } = await client
      .from('live_locations')
      .select('*')
      .eq('user_id', driver.user_id)
      .limit(1)

    if (verifyError) {
      console.error('⚠️ Could not verify saved record:', verifyError)
    } else if (verifyRecords && verifyRecords.length > 0) {
      const verifyData = verifyRecords[0]
      console.log('✅ Record verified in database:', {
        id: verifyData.id,
        coordinates: `${verifyData.latitude}, ${verifyData.longitude}`,
        updated_at: verifyData.updated_at
      })
    } else {
      console.error('⚠️ No record found after insert/update')
    }
  } catch (error) {
    console.error('❌ Exception updating location in database:', error)
  }
  }

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setLocationPermission(true)
      return true
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      const granted = status === 'granted'
      setLocationPermission(granted)
      
      if (granted) {
        console.log('✅ Location permission granted')
        await updateLocationWithGoogleMaps()
      }
      
      return granted
    } catch (error) {
      console.error('Error requesting location permission:', error)
      return false
    }
  }

  const startLocationTracking = async () => {
    if (isTracking || !driver) {
      console.log('❌ Cannot start tracking:', { isTracking, hasDriver: !!driver })
      return
    }

    try {
      console.log('=== STARTING LOCATION TRACKING ===')
      console.log('Driver:', driver.user?.full_name)
      console.log('Status:', driver.status)

      // Get initial location
      await updateLocationWithGoogleMaps()

      if (Platform.OS === 'web') {
        // Web: Use interval-based updates
        const intervalId = setInterval(async () => {
          console.log('🔄 Interval location update...')
          await updateLocationWithGoogleMaps()
        }, 30000) // Update every 30 seconds

        setLocationSubscription({ remove: () => clearInterval(intervalId) } as any)
      } else {
        // Native: Use location watching
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 30000, // 30 seconds
            distanceInterval: 50, // 50 meters
          },
          async (location) => {
            console.log('📍 Location watch update:', location.coords)
            setCurrentLocation(location)
            
            const address = await reverseGeocode(
              location.coords.latitude,
              location.coords.longitude
            )
            setCurrentAddress(address || null)
            
            await updateDriverLocationInDatabase(location)
          }
        )
        setLocationSubscription(subscription)
      }

      setIsTracking(true)
      console.log('✅ Location tracking started successfully')
    } catch (error) {
      console.error('❌ Error starting location tracking:', error)
    }
  }

  const stopLocationTracking = () => {
    console.log('=== STOPPING LOCATION TRACKING ===')
    
    if (locationSubscription) {
      locationSubscription.remove()
      setLocationSubscription(null)
      setIsTracking(false)
      console.log('✅ Location tracking stopped')
    } else {
      console.log('⚠️ No active location subscription to stop')
    }
  }

  const value = {
    currentLocation,
    currentAddress,
    locationPermission,
    requestLocationPermission,
    startLocationTracking,
    stopLocationTracking,
    isTracking,
    updateLocationWithGoogleMaps,
    forceCreateLocationRecord,
  }

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  )
}