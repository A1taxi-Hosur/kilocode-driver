import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  DollarSign, 
  User, 
  CircleCheck as CheckCircle, 
  Circle as XCircle, 
  CircleAlert as AlertCircle, 
  Filter,
  Car,
  Navigation,
  Phone,
  Play,
  MapPinCheck
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabaseAdmin, supabase } from '../../utils/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import OTPModal from '../../components/OTPModal';
import TripCompletionModal from '../../components/TripCompletionModal';

type ScheduledBooking = {
  id: string;
  customer_id: string;
  booking_type: 'outstation' | 'rental' | 'airport';
  vehicle_type: string;
  pickup_address: string;
  destination_address: string;
  pickup_landmark?: string;
  destination_landmark?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  scheduled_time: string | null;
  rental_hours?: number | null;
  special_instructions?: string | null;
  estimated_fare: number | null;
  status: 'pending' | 'assigned' | 'confirmed' | 'cancelled' | 'completed' | 'driver_arrived' | 'in_progress';
  assigned_driver_id: string | null;
  created_at: string;
  updated_at: string;
  pickup_otp?: string | null;
  drop_otp?: string | null;
  customer?: {
    full_name: string;
    phone_number: string;
  };
};

export default function ScheduledTripsScreen() {
  const { driver, updateDriverStatus } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'outstation' | 'rental' | 'airport'>('all');
  const [scheduledBookings, setScheduledBookings] = useState<ScheduledBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeChannel, setRealtimeChannel] = useState<RealtimeChannel | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // OTP Modal states
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpModalType, setOTPModalType] = useState<'pickup' | 'drop' | 'verify-pickup'>('pickup');
  const [currentOTP, setCurrentOTP] = useState('');
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const [tripStartTime, setTripStartTime] = useState<Date | null>(null);
  const [tripStartLocation, setTripStartLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (driver) {
      loadScheduledBookings();
      setupRealtimeSubscription();
    }
    
    return () => {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [driver]);

  const loadScheduledBookings = async () => {
    if (!driver?.id) return;

    try {
      console.log('🔄 === LOADING SCHEDULED BOOKINGS DEBUG ===');
      console.log('🔄 Function called at:', new Date().toISOString());
      console.log('🔄 Driver ID:', driver.id);
      console.log('🔄 Current bookings count before reload:', scheduledBookings.length);
      
      const { data: bookings, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .eq('assigned_driver_id', driver.id)
        .in('status', ['assigned', 'confirmed', 'driver_arrived', 'in_progress'])
        .order('scheduled_time', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ DETAILED FINAL QUERY ERROR:', {
          code: error.code,
          message: error.message,
          details: error.details
        });
        setScheduledBookings([]);
        return;
      }

      const bookingsData = bookings || [];
      console.log('🔄 === FINAL BOOKING DATA LOADED ===');
      console.log(`✅ Final result: ${bookingsData.length} scheduled bookings loaded`);
      console.log('🔄 Previous bookings count:', scheduledBookings.length);
      console.log('🔄 New bookings count:', bookingsData.length);
      
      if (bookingsData.length > 0) {
        console.log('✅ SCHEDULED BOOKINGS FOUND:');
        bookingsData.forEach((booking, index) => {
          console.log(`${index + 1}. ${booking.id.substring(0, 8)}...: ${booking.booking_type} - ${booking.status} - ${booking.pickup_address}`);
        });
      }
      
      setScheduledBookings(bookingsData);
      
    } catch (error) {
      console.error('❌ EXCEPTION in loadScheduledBookings:', error);
      setScheduledBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadScheduledBookings();
    setRefreshing(false);
  };

  const setupRealtimeSubscription = () => {
    if (!driver?.id) return;

    const channel = supabase
      .channel('scheduled_bookings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_bookings',
          filter: `assigned_driver_id=eq.${driver.id}`
        },
        (payload) => {
          console.log('📡 Scheduled booking change detected:', payload);
          loadScheduledBookings();
        }
      )
      .subscribe();

    setRealtimeChannel(channel);
  };

  const handleAcceptBooking = async (bookingId: string) => {
    try {
      console.log('✅ === ACCEPT BOOKING DEBUG ===');
      console.log('✅ Booking ID:', bookingId);
      console.log('✅ Driver ID:', driver?.id);
      console.log('✅ Timestamp:', new Date().toISOString());
      
      setActionLoading(bookingId);
      
      // Check current booking status before update
      const { data: currentBooking, error: checkError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      
      if (checkError) {
        console.error('❌ Error checking current booking:', checkError);
        Alert.alert('Error', 'Failed to check booking status');
        return;
      }
      
      console.log('📋 Current booking before accept:', {
        id: currentBooking.id,
        status: currentBooking.status,
        assigned_driver_id: currentBooking.assigned_driver_id
      });
      
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('assigned_driver_id', driver?.id)
        .select()
        .single();

      if (error) {
        console.error('❌ DETAILED UPDATE ERROR:', {
          code: error.code,
          message: error.message,
          details: error.details
        });
        Alert.alert('Error', 'Failed to accept booking');
        return;
      }

      console.log('✅ Booking accepted successfully:', updatedBooking);
      Alert.alert('Success', 'Booking accepted successfully!');
      await loadScheduledBookings();
      
    } catch (error) {
      console.error('❌ Exception accepting booking:', error);
      Alert.alert('Error', 'Failed to accept booking');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineBooking = async (bookingId: string) => {
    Alert.alert(
      'Decline Booking',
      'Are you sure you want to decline this scheduled booking?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('❌ === DECLINE BOOKING DEBUG ===');
              console.log('❌ Booking ID:', bookingId);
              
              setActionLoading(bookingId);
              
              const { error } = await supabaseAdmin
                .from('scheduled_bookings')
                .update({
                  status: 'cancelled',
                  updated_at: new Date().toISOString()
                })
                .eq('id', bookingId);

              if (error) {
                console.error('❌ Error declining booking:', error);
                Alert.alert('Error', 'Failed to decline booking');
                return;
              }

              console.log('✅ Booking declined successfully');
              Alert.alert('Success', 'Booking declined');
              await loadScheduledBookings();
              
            } catch (error) {
              console.error('❌ Exception declining booking:', error);
              Alert.alert('Error', 'Failed to decline booking');
            } finally {
              setActionLoading(null);
            }
          }
        }
      ]
    );
  };

  const handleMarkArrived = async (bookingId: string) => {
    try {
      console.log('🚨 === HANDLE MARK ARRIVED DEBUG ===');
      console.log('🚨 Function called with bookingId:', bookingId);
      console.log('🚨 Driver available:', !!driver);
      console.log('🚨 Driver ID:', driver?.id);
      console.log('🚨 Timestamp:', new Date().toISOString());
      
      setActionLoading(bookingId);
      
      // Check current booking status before update
      const { data: currentBooking, error: checkError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      
      if (checkError) {
        console.error('❌ Error checking current booking:', checkError);
        Alert.alert('Error', 'Failed to check booking status');
        return;
      }
      
      console.log('📋 Current booking before mark arrived:', {
        id: currentBooking.id,
        status: currentBooking.status,
        assigned_driver_id: currentBooking.assigned_driver_id
      });
      
      console.log('📝 Attempting to update booking status to driver_arrived...');
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'driver_arrived',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('assigned_driver_id', driver?.id)
        .select()
        .single();

      if (error) {
        console.error('❌ DETAILED UPDATE ERROR:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        Alert.alert('Error', 'Failed to update status');
        return;
      }

      if (!updatedBooking) {
        console.error('❌ No booking returned after update - may be assigned to another driver');
        Alert.alert('Error', 'Booking may have been reassigned');
        return;
      }

      console.log('✅ Booking status updated successfully to driver_arrived:', updatedBooking);
      console.log('🔄 Calling loadScheduledBookings to refresh UI...');
      await loadScheduledBookings();
      console.log('✅ UI refresh completed');
      
      Alert.alert('Success', 'Marked as arrived at pickup location');
      
    } catch (error) {
      console.error('❌ EXCEPTION in handleMarkArrived:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePickupOTP = async (bookingId: string) => {
    try {
      console.log('🔐 === GENERATE PICKUP OTP DEBUG ===');
      console.log('🔐 Booking ID:', bookingId);
      console.log('🔐 Driver ID:', driver?.id);
      
      setActionLoading(bookingId);
      
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      console.log('🔐 Generated OTP:', otp);

      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          pickup_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('assigned_driver_id', driver?.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error generating pickup OTP:', error);
        Alert.alert('Error', 'Failed to generate OTP');
        return;
      }

      console.log('✅ Pickup OTP generated and saved:', updatedBooking);
      setCurrentOTP(otp);
      setCurrentBookingId(bookingId);
      setOTPModalType('pickup');
      setShowOTPModal(true);
      
      await loadScheduledBookings();
      
    } catch (error) {
      console.error('❌ Exception generating pickup OTP:', error);
      Alert.alert('Error', 'Failed to generate OTP');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyPickupOTP = (bookingId: string) => {
    console.log('🔍 === VERIFY PICKUP OTP DEBUG ===');
    console.log('🔍 Booking ID:', bookingId);
    
    setCurrentBookingId(bookingId);
    setOTPModalType('verify-pickup');
    setShowOTPModal(true);
  };

  const handleOTPVerification = async (otp: string) => {
    if (!currentBookingId) {
      console.error('❌ No current booking ID for OTP verification');
      return;
    }

    try {
      console.log('🔍 === OTP VERIFICATION DEBUG ===');
      console.log('🔍 Booking ID:', currentBookingId);
      console.log('🔍 Entered OTP:', otp);
      
      setActionLoading(currentBookingId);

      // Get current booking to check stored OTP
      const { data: booking, error: fetchError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('pickup_otp, status')
        .eq('id', currentBookingId)
        .single();

      if (fetchError || !booking) {
        console.error('❌ Error fetching booking for OTP verification:', fetchError);
        Alert.alert('Error', 'Failed to verify OTP');
        return;
      }

      console.log('📋 Current booking OTP data:', {
        stored_otp: booking.pickup_otp,
        entered_otp: otp,
        status: booking.status
      });

      if (booking.pickup_otp !== otp) {
        console.error('❌ OTP verification failed - incorrect OTP');
        Alert.alert('Error', 'Incorrect OTP. Please try again.');
        return;
      }

      console.log('✅ OTP verified successfully, starting trip...');

      // Start the trip
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'in_progress',
          pickup_otp: null, // Clear OTP after verification
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBookingId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error starting trip after OTP verification:', updateError);
        Alert.alert('Error', 'Failed to start trip');
        return;
      }

      console.log('✅ Trip started successfully:', updatedBooking);
      
      // Update driver status to busy
      await updateDriverStatus('busy');
      
      // Initialize trip tracking for scheduled bookings
      const startTime = new Date();
      const startLocation = {
        latitude: updatedBooking.pickup_latitude,
        longitude: updatedBooking.pickup_longitude
      };
      
      setTripStartTime(startTime);
      setTripStartLocation(startLocation);
      
      console.log('🚀 Trip tracking initialized for scheduled booking:', {
        startTime: startTime.toISOString(),
        startLocation,
        bookingId: currentBookingId
      });
      
      setShowOTPModal(false);
      setCurrentBookingId(null);
      setCurrentOTP('');
      
      Alert.alert('Success', 'Trip started successfully!');
      await loadScheduledBookings();
      
    } catch (error) {
      console.error('❌ Exception verifying OTP:', error);
      Alert.alert('Error', 'Failed to verify OTP');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTrip = async (bookingId: string) => {
    try {
      console.log('🚨 === HANDLE START TRIP DEBUG ===');
      console.log('🚨 Function called with bookingId:', bookingId);
      console.log('🚨 Driver available:', !!driver);
      console.log('🚨 Driver ID:', driver?.id);
      console.log('🚨 Driver status before:', driver?.status);
      console.log('🚨 Timestamp:', new Date().toISOString());
      
      setActionLoading(bookingId);
      
      // Check current booking status before update
      const { data: currentBooking, error: checkError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      
      if (checkError) {
        console.error('❌ Error checking current booking:', checkError);
        Alert.alert('Error', 'Failed to check booking status');
        return;
      }
      
      console.log('📋 Current booking before start trip:', {
        id: currentBooking.id,
        status: currentBooking.status,
        assigned_driver_id: currentBooking.assigned_driver_id,
        booking_type: currentBooking.booking_type
      });
      
      console.log('📝 Attempting to update booking status to in_progress...');
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('assigned_driver_id', driver?.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ DETAILED UPDATE ERROR:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        Alert.alert('Error', 'Failed to start trip');
        return;
      }

      if (!updatedBooking) {
        console.error('❌ No booking returned after update');
        Alert.alert('Error', 'Failed to start trip - booking may be reassigned');
        return;
      }

      console.log('✅ Booking status updated successfully to in_progress:', updatedBooking);

      // Update driver status to busy
      console.log('🚗 Updating driver status to busy...');
      await updateDriverStatus('busy');
      console.log('✅ Driver status updated to busy');

      console.log('🔄 Calling loadScheduledBookings to refresh UI...');
      await loadScheduledBookings();
      console.log('✅ UI refresh completed');
      
      Alert.alert('Success', 'Trip started successfully!');
      
    } catch (error) {
      console.error('❌ EXCEPTION in handleStartTrip:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      Alert.alert('Error', 'Failed to start trip');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteTrip = async (bookingId: string) => {
    try {
      console.log('🚨 === HANDLE COMPLETE TRIP DEBUG ===');
      console.log('🚨 Function called with bookingId:', bookingId);
      console.log('🚨 Driver available:', !!driver);
      console.log('🚨 Driver ID:', driver?.id);
      console.log('🚨 Trip start time:', tripStartTime?.toISOString());
      console.log('🚨 Trip start location:', tripStartLocation);
      console.log('🚨 Timestamp:', new Date().toISOString());
      
      setActionLoading(bookingId);
      
      // Check current booking status before update
      const { data: currentBooking, error: checkError } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      
      if (checkError) {
        console.error('❌ Error checking current booking:', checkError);
        Alert.alert('Error', 'Failed to check booking status');
        return;
      }
      
      console.log('📋 Current booking before complete:', {
        id: currentBooking.id,
        status: currentBooking.status,
        assigned_driver_id: currentBooking.assigned_driver_id,
        booking_type: currentBooking.booking_type,
        vehicle_type: currentBooking.vehicle_type
      });
      
      // Calculate trip metrics
      const endTime = new Date();
      const actualDuration = tripStartTime ? Math.round((endTime.getTime() - tripStartTime.getTime()) / (1000 * 60)) : 30; // minutes
      
      // Calculate distance between pickup and destination
      const { calculateDistance } = require('../../utils/maps');
      const tripDistance = calculateDistance(
        { latitude: currentBooking.pickup_latitude, longitude: currentBooking.pickup_longitude },
        { latitude: currentBooking.destination_latitude, longitude: currentBooking.destination_longitude }
      );
      
      console.log('📊 Trip completion metrics:', {
        startTime: tripStartTime?.toISOString(),
        endTime: endTime.toISOString(),
        actualDuration: actualDuration + ' minutes',
        tripDistance: tripDistance.toFixed(2) + ' km',
        bookingType: currentBooking.booking_type
      });
      
      // Get fare matrix for this booking type and vehicle type
      console.log('💰 Fetching fare matrix for scheduled booking:', {
        booking_type: currentBooking.booking_type,
        vehicle_type: currentBooking.vehicle_type
      });
      
      let fareMatrix = null;
      let fareError = null;
      
      // Fetch from appropriate fare table based on booking type
      if (currentBooking.booking_type === 'rental') {
        const { data, error } = await supabaseAdmin
          .from('rental_fares')
          .select('*')
          .eq('vehicle_type', currentBooking.vehicle_type)
          .eq('is_active', true)
          .single();
        fareMatrix = data;
        fareError = error;
      } else if (currentBooking.booking_type === 'outstation') {
        const { data, error } = await supabaseAdmin
          .from('outstation_fares')
          .select('*')
          .eq('vehicle_type', currentBooking.vehicle_type)
          .eq('is_active', true)
          .single();
        fareMatrix = data;
        fareError = error;
      } else if (currentBooking.booking_type === 'airport') {
        const { data, error } = await supabaseAdmin
          .from('airport_fares')
          .select('*')
          .eq('vehicle_type', currentBooking.vehicle_type)
          .eq('is_active', true)
          .single();
        fareMatrix = data;
        fareError = error;
      }
      
      if (fareError || !fareMatrix) {
        console.error('❌ Error fetching fare matrix:', fareError);
        Alert.alert('Error', 'Fare calculation failed - no fare matrix found');
        return;
      }
      
      console.log('✅ Fare matrix loaded:', fareMatrix);
      
      // Calculate fare based on booking type
      let totalFare = 0;
      let fareBreakdown: any = {};
      
      if (currentBooking.booking_type === 'rental') {
        // Rental fare calculation
        const rentalHours = currentBooking.rental_hours || 4;
        const hourlyRate = fareMatrix.hourly_rate || 150;
        const hourlyFare = rentalHours * hourlyRate;
        const driverAllowance = fareMatrix.driver_allowance_per_day || 0;
        
        // Check for overtime
        const actualHours = Math.ceil(actualDuration / 60);
        const overtimeHours = Math.max(0, actualHours - rentalHours);
        const overtimeFare = overtimeHours * (fareMatrix.overtime_rate || hourlyRate * 1.2);
        
        // Check for extra kilometers
        const includedKm = rentalHours * (fareMatrix.km_limit_per_hour || 10);
        const extraKm = Math.max(0, tripDistance - includedKm);
        const extraKmFare = extraKm * (fareMatrix.extra_km_rate || 8);
        
        const subtotal = hourlyFare + overtimeFare + extraKmFare + driverAllowance;
        totalFare = subtotal;
        
        fareBreakdown = {
          base_fare: 0,
          hourly_rate: hourlyRate,
          rental_hours: rentalHours,
          hourly_fare: hourlyFare,
          overtime_hours: overtimeHours,
          overtime_fare: overtimeFare,
          included_km: includedKm,
          extra_km: extraKm,
          extra_km_fare: extraKmFare,
          driver_allowance: driverAllowance,
          total_fare: totalFare
        };
        
        console.log('💰 Rental fare calculated:', fareBreakdown);
        
      } else if (currentBooking.booking_type === 'outstation') {
        // Outstation fare calculation
        const baseFare = fareMatrix.base_fare || 500;
        const perKmRate = fareMatrix.per_km_rate || 14;
        const driverAllowance = fareMatrix.driver_allowance || 300;
        const distanceFare = tripDistance * perKmRate;
        
        // Check for night charges (if trip is during night hours)
        const isNightTime = endTime.getHours() >= 22 || endTime.getHours() <= 6;
        const nightChargePercent = isNightTime ? (fareMatrix.night_charge_percent || 20) : 0;
        const nightCharge = isNightTime ? (baseFare + distanceFare) * (nightChargePercent / 100) : 0;
        
        totalFare = baseFare + distanceFare + driverAllowance + nightCharge;
        
        fareBreakdown = {
          base_fare: baseFare,
          distance_fare: distanceFare,
          driver_allowance: driverAllowance,
          night_charge: nightCharge,
          night_charge_percent: nightChargePercent,
          total_fare: totalFare,
          per_km_rate: perKmRate
        };
        
        console.log('💰 Outstation fare calculated:', fareBreakdown);
        
      } else if (currentBooking.booking_type === 'airport') {
        // Airport fare calculation
        const baseFare = fareMatrix.base_fare || 200;
        const perKmRate = fareMatrix.per_km_rate || 16;
        const airportFee = fareMatrix.airport_fee || 100;
        const distanceFare = tripDistance * perKmRate;
        
        // Check for peak hours (6-10 AM, 6-10 PM)
        const hour = endTime.getHours();
        const isPeakHour = (hour >= 6 && hour <= 10) || (hour >= 18 && hour <= 22);
        const peakMultiplier = isPeakHour ? (fareMatrix.peak_hour_multiplier || 1.5) : 1;
        
        const subtotal = baseFare + distanceFare + airportFee;
        totalFare = subtotal * peakMultiplier;
        
        fareBreakdown = {
          base_fare: baseFare,
          distance_fare: distanceFare,
          airport_fee: airportFee,
          peak_multiplier: peakMultiplier,
          peak_charge: isPeakHour ? (subtotal * (peakMultiplier - 1)) : 0,
          total_fare: totalFare,
          per_km_rate: perKmRate
        };
        
        console.log('💰 Airport fare calculated:', fareBreakdown);
      }
      
      const completionData = {
        distance: tripDistance,
        duration: actualDuration,
        fareBreakdown,
        pickup_address: currentBooking.pickup_address,
        destination_address: currentBooking.destination_address,
        booking_type: currentBooking.booking_type,
        rental_hours: currentBooking.rental_hours
      };
      
      console.log('📝 Attempting to update booking status to completed with fare details...');
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'completed',
          estimated_fare: totalFare,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('assigned_driver_id', driver?.id)
        .select()
        .single();

      if (error) {
        console.error('❌ DETAILED UPDATE ERROR:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        Alert.alert('Error', 'Failed to complete trip');
        return;
      }

      if (!updatedBooking) {
        console.error('❌ No booking returned after update');
        Alert.alert('Error', 'Failed to complete trip');
        return;
      }

      console.log('✅ Booking status updated to completed:', updatedBooking);
      
      // Update driver status back to online
      console.log('🚗 Updating driver status back to online...');
      await updateDriverStatus('online');
      console.log('✅ Driver status updated back to online');

      console.log('🔄 Calling loadScheduledBookings to refresh UI...');
      await loadScheduledBookings();
      console.log('✅ UI refresh completed');
      
      // Reset trip tracking
      setTripStartTime(null);
      setTripStartLocation(null);
      
      // Show completion modal with bill details
      setCompletionData(completionData);
      setShowCompletionModal(true);
      
      console.log('✅ Trip completed successfully with bill generation');
      
    } catch (error) {
      console.error('❌ EXCEPTION in handleCompleteTrip:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      Alert.alert('Error', 'Failed to complete trip');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredBookings = scheduledBookings.filter(booking => {
    if (selectedFilter === 'all') return true;
    return booking.booking_type === selectedFilter;
  });

  const getRideTypeColor = (type: string) => {
    switch (type) {
      case 'rental': return '#8B5CF6';
      case 'outstation': return '#F59E0B';
      case 'airport': return '#06B6D4';
      default: return '#10B981';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'assigned': return '#2563EB';
      case 'confirmed': return '#10B981';
      case 'driver_arrived': return '#8B5CF6';
      case 'in_progress': return '#EF4444';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#64748B';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled';
    
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  const getActionButtons = (booking: ScheduledBooking) => {
    console.log('🎯 getActionButtons called for booking:', {
      id: booking.id.substring(0, 8),
      status: booking.status,
      booking_type: booking.booking_type
    });
    
    const isLoading = actionLoading === booking.id;
    
    switch (booking.status) {
      case 'assigned':
        console.log('🎯 Rendering ASSIGNED buttons (Accept/Decline)');
        return (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.declineButton, isLoading && styles.buttonDisabled]} 
              onPress={() => handleDeclineBooking(booking.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <XCircle size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Decline</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.acceptButton, isLoading && styles.buttonDisabled]} 
              onPress={() => handleAcceptBooking(booking.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
        
      case 'confirmed':
        console.log('🎯 Rendering CONFIRMED button (Mark Arrived)');
        return (
          <TouchableOpacity 
            style={[styles.arrivedButton, isLoading && styles.buttonDisabled]} 
            onPress={() => {
              console.log('🚨 MARK ARRIVED BUTTON CLICKED for booking:', booking.id);
              handleMarkArrived(booking.id);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MapPinCheck size={16} color="#FFFFFF" />
                <Text style={styles.buttonText}>Mark as Arrived</Text>
              </>
            )}
          </TouchableOpacity>
        );
        
      case 'driver_arrived':
        console.log('🎯 Rendering DRIVER_ARRIVED buttons (Generate OTP/Verify OTP/Start Trip)');
        return (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.otpButton, isLoading && styles.buttonDisabled]} 
              onPress={() => handleGeneratePickupOTP(booking.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <AlertCircle size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Send OTP</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.verifyButton, isLoading && styles.buttonDisabled]} 
              onPress={() => handleVerifyPickupOTP(booking.id)}
              disabled={isLoading}
            >
              <CheckCircle size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>Verify OTP</Text>
            </TouchableOpacity>
          </View>
        );
        
      case 'in_progress':
        console.log('🎯 Rendering IN_PROGRESS button (Complete Trip)');
        return (
          <TouchableOpacity 
            style={[styles.completeButton, isLoading && styles.buttonDisabled]} 
            onPress={() => {
              console.log('🚨 COMPLETE TRIP BUTTON CLICKED for booking:', booking.id);
              handleCompleteTrip(booking.id);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <CheckCircle size={16} color="#FFFFFF" />
                <Text style={styles.buttonText}>Complete Trip</Text>
              </>
            )}
          </TouchableOpacity>
        );
        
      default:
        console.log('🎯 No buttons for status:', booking.status);
        return null;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading scheduled trips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Scheduled Trips</Text>
          <TouchableOpacity style={styles.filterButton}>
            <Filter size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          {(['all', 'outstation', 'rental', 'airport'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterTab,
                selectedFilter === filter && styles.filterTabActive
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === filter && styles.filterTabTextActive
                ]}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rides List */}
        {filteredBookings.length > 0 ? (
          filteredBookings.map((booking) => {
            const dateTime = formatDate(booking.scheduled_time);
            const isLoading = actionLoading === booking.id;
            
            return (
              <View key={booking.id} style={styles.rideCard}>
                <View style={styles.rideHeader}>
                  <View style={styles.rideTypeContainer}>
                    <Text style={styles.rideCode}>#{booking.id.substring(0, 8)}</Text>
                    <View
                      style={[
                        styles.rideTypeBadge,
                        { backgroundColor: getRideTypeColor(booking.booking_type) }
                      ]}
                    >
                      <Text style={styles.rideTypeText}>
                        {booking.booking_type.toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(booking.status) }
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {booking.status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.dateTimeContainer}>
                    <Text style={styles.dateText}>{dateTime.date}</Text>
                    <Text style={styles.timeText}>{dateTime.time}</Text>
                  </View>
                </View>

                {/* Customer Info */}
                <View style={styles.customerRow}>
                  <User size={16} color="#64748B" />
                  <Text style={styles.customerName}>
                    {booking.customer?.full_name || 'Anonymous'}
                  </Text>
                  {booking.customer?.phone_number && (
                    <TouchableOpacity style={styles.phoneButton}>
                      <Phone size={14} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Address Container */}
                <View style={styles.addressContainer}>
                  <View style={styles.addressItem}>
                    <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                    <View style={styles.addressInfo}>
                      <Text style={styles.addressText}>{booking.pickup_address}</Text>
                      {booking.pickup_landmark && (
                        <Text style={styles.landmarkText}>Near {booking.pickup_landmark}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.routeLine} />
                  <View style={styles.addressItem}>
                    <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                    <View style={styles.addressInfo}>
                      <Text style={styles.addressText}>{booking.destination_address}</Text>
                      {booking.destination_landmark && (
                        <Text style={styles.landmarkText}>Near {booking.destination_landmark}</Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Ride Stats */}
                <View style={styles.rideStats}>
                  <View style={styles.statItem}>
                    <DollarSign size={16} color="#10B981" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>₹{booking.estimated_fare || 'TBD'}</Text>
                      <Text style={styles.statSubtext}>Fare</Text>
                    </View>
                  </View>
                  
                  <View style={styles.statItem}>
                    <Clock size={16} color="#64748B" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>
                        {booking.booking_type === 'rental' && booking.rental_hours 
                          ? `${booking.rental_hours}h` 
                          : 'TBD'
                        }
                      </Text>
                      <Text style={styles.statSubtext}>
                        {booking.booking_type === 'rental' ? 'Duration' : 'Time'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.statItem}>
                    <Car size={16} color="#2563EB" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>{booking.vehicle_type}</Text>
                      <Text style={styles.statSubtext}>Vehicle</Text>
                    </View>
                  </View>

                  <View style={styles.statItem}>
                    <Calendar size={16} color="#8B5CF6" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>{dateTime.time}</Text>
                      <Text style={styles.statSubtext}>Scheduled</Text>
                    </View>
                  </View>
                </View>

                {/* Special Info for Different Booking Types */}
                {booking.booking_type === 'rental' && booking.rental_hours && (
                  <View style={styles.specialInfo}>
                    <Clock size={16} color="#8B5CF6" />
                    <Text style={styles.specialInfoText}>
                      Rental Duration: {booking.rental_hours} hours
                    </Text>
                  </View>
                )}

                {booking.booking_type === 'outstation' && (
                  <View style={styles.specialInfo}>
                    <Navigation size={16} color="#F59E0B" />
                    <Text style={styles.specialInfoText}>
                      Outstation Trip - Multi-day journey
                    </Text>
                  </View>
                )}

                {booking.booking_type === 'airport' && (
                  <View style={styles.specialInfo}>
                    <AlertCircle size={16} color="#06B6D4" />
                    <Text style={styles.specialInfoText}>
                      Airport Transfer - Check flight details
                    </Text>
                  </View>
                )}

                {/* Special Instructions */}
                {booking.special_instructions && (
                  <View style={styles.instructionsInfo}>
                    <AlertCircle size={16} color="#64748B" />
                    <Text style={styles.instructionsText}>
                      Instructions: {booking.special_instructions}
                    </Text>
                  </View>
                )}

                {/* Action Buttons */}
                {getActionButtons(booking)}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Calendar size={64} color="#CBD5E1" />
            <Text style={styles.emptyStateTitle}>No Scheduled Trips</Text>
            <Text style={styles.emptyStateText}>
              {selectedFilter === 'all' 
                ? 'You have no scheduled trips at the moment'
                : `No ${selectedFilter} trips scheduled`
              }
            </Text>
          </View>
        )}
      </ScrollView>

      {/* OTP Modal */}
      <OTPModal
        visible={showOTPModal}
        type={otpModalType}
        currentOTP={currentOTP}
        onVerify={handleOTPVerification}
        onClose={() => {
          setShowOTPModal(false);
          setCurrentBookingId(null);
          setCurrentOTP('');
        }}
      />

      {/* Trip Completion Modal */}
      {completionData && (
        <TripCompletionModal
          visible={showCompletionModal}
          tripData={completionData}
          onClose={() => {
            setShowCompletionModal(false);
            setCompletionData(null);
          }}
        />
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
  },
  filterButton: {
    padding: 8,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  rideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rideTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rideCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rideTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rideTypeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  dateTimeContainer: {
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  timeText: {
    fontSize: 10,
    color: '#64748B',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginLeft: 8,
  },
  phoneButton: {
    width: 28,
    height: 28,
    backgroundColor: '#EBF4FF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressContainer: {
    marginBottom: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  addressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    marginTop: 6,
  },
  addressInfo: {
    flex: 1,
  },
  addressText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  landmarkText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginLeft: 3,
    marginBottom: 8,
  },
  rideStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statInfo: {
    alignItems: 'center',
    marginTop: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E293B',
    textAlign: 'center',
  },
  statSubtext: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  specialInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  specialInfoText: {
    fontSize: 14,
    color: '#1E40AF',
    marginLeft: 8,
    fontWeight: '500',
  },
  instructionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  instructionsText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
});