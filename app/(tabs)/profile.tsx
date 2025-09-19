import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Car, LogOut, Star, Shield, MapPin } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { useRouter, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen() {
  const { signOut, driver, updateDriverStatus } = useAuth();
  const { currentAddress, forceCreateLocationRecord } = useLocation();

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'busy': return '#F59E0B';
      case 'offline': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'online': return 'Online';
      case 'busy': return 'Busy';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  const debugDriverData = async () => {
    console.log('=== COMPREHENSIVE DRIVER DEBUG ===');
    console.log('Current driver object:', JSON.stringify(driver, null, 2));
    
    if (!driver) {
      console.log('❌ No driver object available');
      return;
    }
    
    // Import supabase for debugging
    const { supabase } = require('../../utils/supabase');
    
    try {
      // Check drivers table
      console.log('=== CHECKING DRIVERS TABLE ===');
      const { data: driversData, error: driversError } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', driver.id);
        
      if (driversError) {
        console.error('Error fetching drivers:', driversError);
      } else {
        console.log('Drivers table data:', driversData);
      }
      
      // Check users table
      console.log('=== CHECKING USERS TABLE ===');
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'driver');
        
      if (usersError) {
        console.error('Error fetching users:', usersError);
      } else {
        console.log('All driver users:', usersData);
      }
      
      // Check driver_credentials table
      console.log('=== CHECKING DRIVER CREDENTIALS ===');
      const { data: credentialsData, error: credentialsError } = await supabase
        .from('driver_credentials')
        .select('*');
        
      if (credentialsError) {
        console.error('Error fetching credentials:', credentialsError);
      } else {
        console.log('Driver credentials:', credentialsData);
      }
      
      // Check if there's a user_id mismatch
      if (driver.user_id) {
        console.log('=== CHECKING USER_ID RELATIONSHIP ===');
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', driver.user_id)
          .single();
          
        if (userError) {
          console.error('❌ User not found for user_id:', driver.user_id, userError);
        } else {
          console.log('✅ User found:', userData);
        }
      }
      
    } catch (error) {
      console.error('Debug error:', error);
    }
  };

  const setupMissingDatabaseRecords = async () => {
    if (!driver) {
      console.log('❌ No driver object available');
      return;
    }

    console.log('=== SETTING UP MISSING DATABASE RECORDS ===');
    console.log('Driver object:', JSON.stringify(driver, null, 2));

    try {
      // Call the edge function to setup database records
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/setup-database/setup-driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: driver.user_id,
          driver_id: driver.id,
          email: driver.user?.email || 'driver@example.com',
          full_name: driver.user?.full_name || 'Test Driver',
          phone_number: driver.user?.phone_number || '+1234567890'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('🎉 ALL DATABASE RECORDS CREATED SUCCESSFULLY!');
        console.log('🔄 Please refresh the app or re-login to see the changes');
        
        if (Platform.OS === 'web') {
          window.alert('✅ Database records created successfully! Please refresh the app.');
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Success', 'Database records created successfully! Please refresh the app.');
        }
      } else {
        console.error('❌ Error from edge function:', result.error);
        
        if (Platform.OS === 'web') {
          window.alert(`❌ Error: ${result.error}`);
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Error', result.error);
        }
      }
      

    } catch (error) {
      console.error('❌ Error setting up database records:', error);
      
      if (Platform.OS === 'web') {
        window.alert(`❌ Error: ${error.message}`);
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', error.message);
      }
    }
  };
  const handleSignOut = () => {
    console.log('=== SIGN OUT BUTTON CLICKED ===');
    
    if (Platform.OS === 'web') {
      // Use web-native confirm dialog
      console.log('Using web confirm dialog...');
      const confirmed = window.confirm('Are you sure you want to sign out?');
      console.log('User confirmed:', confirmed);
      
      if (confirmed) {
        performSignOut();
      } else {
        console.log('Sign out cancelled by user');
      }
    } else {
      // Use React Native Alert for mobile
      const { Alert } = require('react-native');
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign Out', 
            style: 'destructive', 
            onPress: performSignOut
          }
        ]
      );
    }
  };

  const performSignOut = async () => {
    try {
      console.log('=== SIGN OUT INITIATED ===');
      await signOut();
      console.log('✅ Sign out completed');
    } catch (error) {
      console.error('Sign out error:', error);
      
      if (Platform.OS === 'web') {
        window.alert('Failed to sign out. Please try again.');
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    }
  };

  const createLocationRecord = async () => {
    if (!driver) {
      console.log('❌ No driver object available');
      return;
    }

    console.log('=== ENSURING DRIVER IS AVAILABLE FOR CUSTOMERS ===');
    console.log('Making sure driver is online, verified, and has location');

    try {
      // Step 1: Ensure driver is online and verified
      const { supabaseAdmin } = require('../../utils/supabase');
      
      console.log('🔧 Setting driver to online and verified...');
      const { error: driverUpdateError } = await supabaseAdmin
        .from('drivers')
        .update({
          status: 'online',
          is_verified: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', driver.id);
      
      if (driverUpdateError) {
        console.error('❌ Error updating driver status:', driverUpdateError);
      } else {
        console.log('✅ Driver set to online and verified');
      }
      
      // Step 2: Create/update location record
      const success = await forceCreateLocationRecord();
      
      if (success) {
        console.log('✅ Driver is now available for customer bookings!');
        
        if (Platform.OS === 'web') {
          window.alert('✅ Driver is now ONLINE and AVAILABLE for customer bookings!');
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Success', 'Driver is now ONLINE and AVAILABLE for customer bookings!');
        }
      } else {
        console.error('❌ Failed to make driver available');
        
        if (Platform.OS === 'web') {
          window.alert('❌ Failed to make driver available. Check console for details.');
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Error', 'Failed to make driver available. Check console for details.');
        }
      }
    } catch (error) {
      console.error('❌ Error making driver available:', error);
      
      if (Platform.OS === 'web') {
        window.alert(`❌ Error: ${error.message}`);
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', error.message);
      }
    }
  };

  const testNotificationFlow = async () => {
    if (!driver) {
      console.log('❌ No driver object available');
      return;
    }

    console.log('=== TESTING COMPREHENSIVE RIDE REQUEST NOTIFICATION FLOW ===');
    console.log('Driver User ID:', driver.user_id);
    console.log('Driver ID:', driver.id);
    console.log('Driver Status:', driver.status);
    console.log('Driver Online:', driver.status === 'online');
    console.log('Driver Location Available:', !!driver.location);

    try {
      // Import supabase clients for testing
      const { supabase, supabaseAdmin } = require('../../utils/supabase');
      
      // Step 1: Ensure driver is online and has location
      if (driver.status !== 'online') {
        console.log('⚠️ Driver is not online, setting to online for test...');
        await supabaseAdmin
          .from('drivers')
          .update({ status: 'online', is_verified: true })
          .eq('id', driver.id);
      }
      
      // Step 2: Ensure driver has location record
      console.log('📍 Ensuring driver has location record...');
      const { data: locationCheck, error: locationError } = await supabaseAdmin
        .from('live_locations')
        .select('*')
        .eq('user_id', driver.user_id)
        .limit(1);
      
      if (!locationCheck || locationCheck.length === 0) {
        console.log('📍 Creating location record for driver...');
        await supabaseAdmin
          .from('live_locations')
          .insert({
            user_id: driver.user_id,
            latitude: 12.7401984, // Bangalore coordinates
            longitude: 77.824,
            accuracy: 10,
            updated_at: new Date().toISOString()
          });
        console.log('✅ Location record created');
      } else {
        console.log('✅ Location record exists:', locationCheck[0]);
      }
      
      // Step 2: Create a comprehensive test ride request
      console.log('🚗 CREATING COMPREHENSIVE TEST RIDE REQUEST...');
      const testRide = {
        ride_code: 'TEST-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        customer_id: driver.user_id, // Use current driver's user_id to satisfy foreign key constraint
        pickup_latitude: 12.7401984,
        pickup_longitude: 77.8240,
        pickup_address: 'MG Road, Bangalore - TEST RIDE',
        pickup_landmark: 'Near Metro Station',
        destination_latitude: 12.7687313,
        destination_longitude: 77.7923735,
        destination_address: 'Koramangala, Bangalore - TEST DESTINATION',
        destination_landmark: 'Near Forum Mall',
        booking_type: 'regular',
        vehicle_type: driver.vehicle?.vehicle_type || 'sedan',
        fare_amount: 250,
        payment_method: 'cash',
        payment_status: 'pending',
        status: 'requested'
      };
      
      console.log('📋 Test ride data:', testRide);
      
      const { data: insertedRide, error: rideError } = await supabaseAdmin
        .from('rides')
        .insert(testRide)
        .select()
        .single();
      
      if (rideError) {
        console.error('❌ Error creating test ride:', rideError);
        if (Platform.OS === 'web') {
          window.alert(`❌ Error creating test ride: ${rideError.message}`);
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Error', `Error creating test ride: ${rideError.message}`);
        }
        return;
      }
      
      console.log('✅ TEST RIDE CREATED SUCCESSFULLY:', insertedRide.id);
      console.log('📍 Pickup:', testRide.pickup_address);
      console.log('📍 Destination:', testRide.destination_address);
      console.log('💰 Fare:', testRide.fare_amount);
      
      // Step 3: Call the notification API to find and notify nearby drivers
      console.log('📤 CALLING NOTIFICATION API...');
      
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      console.log('🔔 Using Supabase URL:', supabaseUrl);
      const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/driver-api/notify-drivers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          // Use the test ride ID that was created
          ride_id: insertedRide.id
        })
      });
      
      const notifyResult = await notifyResponse.json();
      console.log('📤 Notification API result:', notifyResult);
      
      console.log('🔔 Full notification response:', JSON.stringify(notifyResult, null, 2));
      if (!notifyResult.success) {
        console.error('❌ Notification API failed:', notifyResult.error);
        
        if (Platform.OS === 'web') {
          window.alert(`❌ Notifications failed: ${notifyResult.error}`);
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Notifications Failed', notifyResult.error);
        }
      } else {
        console.log('✅ COMPREHENSIVE RIDE REQUEST NOTIFICATION SYSTEM ACTIVATED!');
        console.log('✅ Drivers found:', notifyResult.drivers_found);
        console.log('✅ Notifications sent:', notifyResult.notifications_sent);
        console.log('✅ Ride ID:', insertedRide.id);
        console.log('✅ COMPREHENSIVE SYSTEM: Driver should receive notification via:');
        console.log('✅ 1) Real-time Supabase subscriptions');
        console.log('✅ 2) Database notifications table');
        console.log('✅ 3) Polling backup system');
        
        // Wait and show result
        console.log('🔔 Waiting 2 seconds before showing final result...');
        setTimeout(() => {
          if (Platform.OS === 'web') {
            window.alert(`✅ COMPREHENSIVE TEST COMPLETED!\n\nRide ID: ${insertedRide.id}\nDrivers found: ${notifyResult.drivers_found}\nNotifications sent: ${notifyResult.notifications_sent}\n\nCheck rides tab for the request!\n\nSystem uses multiple methods:\n1. Real-time subscriptions\n2. Database notifications\n3. Polling backup`);
          } else {
            const { Alert } = require('react-native');
            Alert.alert('Comprehensive Test Complete', `Test ride request created! ${notifyResult.notifications_sent} notifications sent. Check rides tab.`);
          }
        }, 2000);
      }
      
    } catch (error) {
      console.error('❌ TEST RIDE REQUEST EXCEPTION:', error);
      
      if (Platform.OS === 'web') {
        window.alert(`❌ Test failed: ${error.message}`);
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Test Failed', error.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.profileInfo}>
            <View style={styles.avatarContainer}>
              <User size={32} color="#64748B" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{driver?.user?.full_name || 'Driver Name'}</Text>
              <Text style={styles.userEmail}>{driver?.user?.email || driver?.user?.phone_number || 'No contact info'}</Text>
              <View style={styles.statusContainer}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(driver?.status) }]} />
                <Text style={styles.statusText}>{getStatusText(driver?.status)}</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.ratingContainer}>
            <Star size={20} color="#F59E0B" />
            <Text style={styles.ratingText}>{driver?.rating || '5.0'}</Text>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{driver?.total_rides || 0}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{driver?.rating || '5.0'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>100%</Text>
            <Text style={styles.statLabel}>Acceptance</Text>
          </View>
        </View>

        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.cardHeader}>
            <Car size={20} color="#2563EB" />
            <Text style={styles.cardTitle}>Vehicle Information</Text>
          </View>
          <View style={styles.vehicleInfo}>
            {driver?.vehicle ? (
              <>
                <Text style={styles.vehicleText}>
                  {driver.vehicle.make} {driver.vehicle.model} ({driver.vehicle.year})
                </Text>
                <Text style={styles.vehicleDetails}>
                  {driver.vehicle.registration_number} • {driver.vehicle.color} • {driver.vehicle.vehicle_type}
                </Text>
              </>
            ) : (
              <Text style={styles.vehicleText}>No vehicle assigned</Text>
            )}
          </View>
        </View>

        {/* Current Location */}
        <View style={styles.locationCard}>
          <View style={styles.cardHeader}>
            <MapPin size={20} color="#10B981" />
            <Text style={styles.cardTitle}>Current Location</Text>
          </View>
          <View style={styles.locationInfo}>
            <Text style={styles.locationText}>
              {currentAddress || 'Location not available'}
            </Text>
          </View>
        </View>

        {/* License Info */}
        <View style={styles.licenseCard}>
          <View style={styles.cardHeader}>
            <Shield size={20} color="#10B981" />
            <Text style={styles.cardTitle}>License Information</Text>
          </View>
          <View style={styles.licenseInfo}>
            <Text style={styles.licenseNumber}>
              License: {driver?.license_number || 'Not available'}
            </Text>
            <Text style={styles.licenseExpiry}>
              Expires: {driver?.license_expiry ? new Date(driver.license_expiry).toLocaleDateString('en-IN') : 'Not available'}
            </Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Debug Info */}
        <View style={styles.debugInfo}>
          <Text style={styles.debugTitle}>Debug Information</Text>
          <Text style={styles.debugText}>Driver Name: {driver?.user?.full_name || 'Not available'}</Text>
          <Text style={styles.debugText}>Driver ID: {driver?.id?.substring(0, 8) || 'Not available'}...</Text>
          <Text style={styles.debugText}>User ID: {driver?.user_id || 'Not available'}</Text>
          <Text style={styles.debugText}>User Email: {driver?.user?.email || 'Not available'}</Text>
          <Text style={styles.debugText}>Phone: {driver?.user?.phone_number || 'Not available'}</Text>
          <Text style={styles.debugText}>Status: {driver?.status || 'Not available'}</Text>
          <Text style={styles.debugText}>Verified: {driver?.is_verified ? 'Yes' : 'No'}</Text>
          <Text style={styles.debugText}>License: {driver?.license_number || 'Not available'}</Text>
          
          <TouchableOpacity 
            style={[styles.debugButton, { backgroundColor: '#8B5CF6', marginTop: 12 }]}
            onPress={debugDriverData}
          >
            <Text style={styles.debugButtonText}>🔍 Debug Driver Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.debugButton, { backgroundColor: '#EF4444', marginTop: 8 }]}
            onPress={setupMissingDatabaseRecords}
          >
            <Text style={styles.debugButtonText}>🔧 Setup Missing Database Records</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.debugButton, { backgroundColor: '#10B981', marginTop: 8 }]}
            onPress={createLocationRecord}
          >
            <Text style={styles.debugButtonText}>🟢 Make Driver Available for Customers</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.debugButton, { backgroundColor: '#F59E0B', marginTop: 8 }]}
            onPress={testNotificationFlow}
          >
            <Text style={styles.debugButtonText}>🔔 Test Notification Flow</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>TaxiDriver Pro v1.0.0</Text>
          <Text style={styles.copyright}>© 2025 TaxiDriver Pro. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#F1F5F9',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginLeft: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  licenseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 8,
  },
  vehicleInfo: {
    marginLeft: 28,
  },
  vehicleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 4,
  },
  vehicleDetails: {
    fontSize: 14,
    color: '#64748B',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  locationInfo: {
    marginLeft: 28,
  },
  locationText: {
    fontSize: 14,
    color: '#1E293B',
  },
  licenseInfo: {
    marginLeft: 28,
  },
  licenseNumber: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  licenseExpiry: {
    fontSize: 14,
    color: '#64748B',
  },
  signOutButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  debugInfo: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#64748B',
    marginBottom: 4,
  },
  debugButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  debugButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
});