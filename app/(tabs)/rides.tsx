import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Clock, DollarSign, User, Navigation, Phone, CircleCheck as CheckCircle, Circle as XCircle, CircleAlert as AlertCircle, Car, Power } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRide } from '../../contexts/RideContext';
import { useLocation } from '../../contexts/LocationContext';
import { calculateDistance, openGoogleMapsNavigation } from '../../utils/maps';
import RideRequestModal from '../../components/RideRequestModal';
import OTPModal from '../../components/OTPModal';
import MapView from '../../components/MapView';
import TripCompletionModal from '../../components/TripCompletionModal';

export default function RidesScreen() {
  const { driver, updateDriverStatus } = useAuth();
  const { 
    currentRide, 
    pendingRides, 
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
    clearError
  } = useRide();
  const { currentLocation, currentAddress, isTracking } = useLocation();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideRequest, setSelectedRideRequest] = useState(null);
  const [showRideRequestModal, setShowRideRequestModal] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpModalType, setOTPModalType] = useState<'pickup' | 'drop' | 'verify-pickup'>('pickup');
  const [currentOTP, setCurrentOTP] = useState('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState(null);

  // Debug: Track component state changes
  useEffect(() => {
    console.log('=== RIDES SCREEN STATE DEBUG ===')
    console.log('🔄 Component state updated:')
    console.log('  - Current ride:', currentRide ? {
      id: currentRide.id,
      status: currentRide.status,
      pickup: currentRide.pickup_address,
      destination: currentRide.destination_address
    } : 'null')
    console.log('  - Pending rides count:', pendingRides?.length || 0)
    console.log('  - Driver status:', driver?.status)
    console.log('  - Loading:', loading)
    console.log('  - Error:', error)
    console.log('  - Show modal:', showRideRequestModal)
    console.log('  - Timestamp:', new Date().toISOString())
    
    if (currentRide) {
      console.log('✅ CURRENT RIDE EXISTS - should be visible in UI')
    } else {
      console.log('❌ NO CURRENT RIDE - showing empty state')
    }
  }, [currentRide, pendingRides, driver?.status, loading, error, showRideRequestModal])

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      clearError();
    }
  }, [error]);

  useEffect(() => {
    console.log('=== RIDE REQUEST MODAL LOGIC DEBUG ===')
    console.log('🔄 Checking if should show ride request modal:')
    console.log('  - Pending rides:', Array.isArray(pendingRides) ? pendingRides.length : 'not array')
    console.log('  - Modal already showing:', showRideRequestModal)
    console.log('  - Driver status:', driver?.status)
    console.log('  - Has current ride:', !!currentRide)
    
    // CRITICAL: Show ride request modal when new pending rides arrive
    if (Array.isArray(pendingRides) && pendingRides.length > 0 && !showRideRequestModal && (driver?.status === 'online' || driver?.status === 'busy')) {
      console.log('✅ SHOWING RIDE REQUEST MODAL')
      console.log('🚗 Showing ride request modal for:', pendingRides[0].id)
      console.log('🚗 Ride details:', {
        pickup: pendingRides[0].pickup_address,
        destination: pendingRides[0].destination_address,
        customer: pendingRides[0].customer?.full_name
      })
      setSelectedRideRequest(pendingRides[0])
      setShowRideRequestModal(true)
    } else {
      console.log('❌ NOT SHOWING MODAL - reasons:')
      console.log('🚗 Analysis:', {
        pendingRidesCount: pendingRides ? pendingRides.length : 0,
        modalAlreadyShowing: showRideRequestModal,
        driverStatus: driver?.status,
        hasCurrentRide: !!currentRide
      })
    }
  }, [pendingRides, showRideRequestModal, driver?.status, currentRide]);


  const handleRefresh = async () => {
    console.log('=== MANUAL REFRESH TRIGGERED ===')
    console.log('🔄 User pulled to refresh rides screen')
    console.log('🔄 Timestamp:', new Date().toISOString())
    setRefreshing(true);
    await refreshRides();
    console.log('✅ Manual refresh completed')
    setRefreshing(false);
  };

  const handleStatusToggle = async (newStatus: 'online' | 'offline') => {
    try {
      await updateDriverStatus(newStatus);
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleAcceptRide = async () => {
    if (!selectedRideRequest) return;
    
    console.log('=== HANDLE ACCEPT RIDE BUTTON CLICKED ===')
    console.log('🚗 User clicked accept for ride:', selectedRideRequest.id)
    console.log('🚗 Selected ride details:', {
      id: selectedRideRequest.id,
      status: selectedRideRequest.status,
      pickup: selectedRideRequest.pickup_address,
      destination: selectedRideRequest.destination_address
    })
    
    const success = await acceptRide(selectedRideRequest.id);
    console.log('🚗 Accept ride function result:', success)
    
    if (success) {
      console.log('✅ RIDE ACCEPTED SUCCESSFULLY')
      console.log('✅ Closing modal and clearing selected ride...')
      setShowRideRequestModal(false)
      setSelectedRideRequest(null)
      
      // Show success message
      Alert.alert('Success', 'Ride accepted successfully!')
      console.log('✅ Success alert shown')
      console.log('✅ Ride should now appear in current ride section')
    } else {
      console.error('❌ FAILED TO ACCEPT RIDE')
      Alert.alert('Error', 'Failed to accept ride. Please try again.')
    }
  };

  const handleDeclineRide = async () => {
    if (!selectedRideRequest) return;
    
    await declineRide(selectedRideRequest.id);
    setShowRideRequestModal(false);
    setSelectedRideRequest(null);
  };


  const handleDriverArrived = async () => {
    if (!currentRide) return;
    await markDriverArrived(currentRide.id);
  };

  const handleGeneratePickupOTP = async () => {
    if (!currentRide) return;
    
    const otp = await generatePickupOTP(currentRide.id);
    if (otp) {
      setCurrentOTP(otp);
      setOTPModalType('pickup');
      setShowOTPModal(true);
    }
  };

  const handleVerifyPickupOTP = () => {
    setOTPModalType('verify-pickup');
    setShowOTPModal(true);
  };

  const handleOTPVerification = async (otp: string) => {
    if (!currentRide) return;
    
    const success = await verifyPickupOTP(currentRide.id, otp);
    if (success) {
      setShowOTPModal(false);
    }
  };

  const handleStartRide = async () => {
    if (!currentRide) return;
    await startRide(currentRide.id);
  };

  const handleGenerateDropOTP = async () => {
    if (!currentRide) return;
    
    const otp = await generateDropOTP(currentRide.id);
    if (otp) {
      setCurrentOTP(otp);
      setOTPModalType('drop');
      setShowOTPModal(true);
    }
  };

  const handleCompleteRide = async () => {
    console.log('🚨 COMPLETE RIDE BUTTON CLICKED!');
    console.log('🚨 Current ride exists:', !!currentRide);
    console.log('🚨 Current ride ID:', currentRide?.id);
    
    if (!currentRide) return;
    
    console.log('🚨 About to call completeRide function...');
    try {
      console.log('🚨 Calling completeRide with ID:', currentRide.id);
      const result = await completeRide(currentRide.id);
      console.log('🚨 CompleteRide function completed, result:', result);
      
      if (result.success) {
        console.log('✅ Ride completed successfully');
        if (result.completionData) {
          setCompletionData(result.completionData);
          setShowCompletionModal(true);
        }
      } else {
        console.error('❌ Failed to complete ride');
        Alert.alert('Error', 'Failed to complete ride. Please try again.');
      }
    } catch (error) {
      console.error('❌ EXCEPTION in handleCompleteRide:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      Alert.alert('Error', 'An error occurred while completing the ride.');
    }
  };

  const handleCancelRide = () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            if (currentRide) {
              await cancelRide(currentRide.id, 'Driver cancelled');
            }
          }
        }
      ]
    );
  };

  const handleDirectionsToPickup = async () => {
    if (!currentRide) return;
    
    try {
      await openGoogleMapsNavigation(
        parseFloat(currentRide.pickup_latitude.toString()),
        parseFloat(currentRide.pickup_longitude.toString()),
        currentRide.pickup_address
      );
    } catch (error) {
      console.error('Error opening directions to pickup:', error);
      Alert.alert('Error', 'Could not open directions');
    }
  };

  const handleDirectionsToDestination = async () => {
    if (!currentRide) return;
    
    try {
      await openGoogleMapsNavigation(
        parseFloat(currentRide.destination_latitude.toString()),
        parseFloat(currentRide.destination_longitude.toString()),
        currentRide.destination_address
      );
    } catch (error) {
      console.error('Error opening directions to destination:', error);
      Alert.alert('Error', 'Could not open directions');
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'busy': return '#F59E0B';
      case 'offline': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getRideStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#2563EB';
      case 'driver_arrived': return '#F59E0B';
      case 'in_progress': return '#10B981';
      default: return '#6B7280';
    }
  };

  const formatDistance = (distance: number | null) => {
    if (!distance) return 'N/A';
    if (distance < 1) {
      return `${(distance * 1000).toFixed(0)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Rides</Text>
          <View style={styles.headerRight}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(driver?.status) }]} />
            <Text style={styles.statusText}>{driver?.status?.toUpperCase() || 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Driver Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusInfo}>
              <Power size={24} color={driver?.status === 'online' ? '#10B981' : '#6B7280'} />
              <View style={styles.statusDetails}>
                <Text style={styles.statusTitle}>Driver Status</Text>
                <Text style={styles.statusSubtitle}>
                  {driver?.status === 'online' ? 'Available for rides' : 
                   driver?.status === 'busy' ? 'On a ride' : 'Not accepting rides'}
                </Text>
              </View>
            </View>
            
            {driver?.status !== 'busy' && (
              <Switch
                value={driver?.status === 'online'}
                onValueChange={(value) => handleStatusToggle(value ? 'online' : 'offline')}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                thumbColor={driver?.status === 'online' ? '#FFFFFF' : '#9CA3AF'}
              />
            )}
          </View>

          {/* Location Info */}
          {currentLocation && (
            <View style={styles.locationInfo}>
              <MapPin size={16} color="#64748B" />
              <Text style={styles.locationText}>
                {currentAddress || `${currentLocation.coords.latitude.toFixed(4)}, ${currentLocation.coords.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}

          {/* Tracking Status */}
          <View style={styles.trackingStatus}>
            <View style={[styles.trackingDot, { backgroundColor: isTracking ? '#10B981' : '#EF4444' }]} />
            <Text style={styles.trackingText}>
              Location tracking: {isTracking ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Current Ride */}
        {currentRide && (
          <View style={styles.currentRideCard}>
            <View style={styles.rideHeader}>
              <Text style={styles.rideTitle}>Current Ride</Text>
              <View style={[styles.rideStatusBadge, { backgroundColor: getRideStatusColor(currentRide.status) }]}>
                <Text style={styles.rideStatusText}>{currentRide.status.replace('_', ' ').toUpperCase()}</Text>
              </View>
            </View>

            {/* Map */}
            <View style={styles.mapContainer}>
              <MapView height={200} showCurrentRide={true} showRoute={true} />
            </View>

            {/* Ride Details */}
            <View style={styles.rideDetails}>
              <View style={styles.addressContainer}>
                <View style={styles.addressItem}>
                  <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                  <View style={styles.addressWithButton}>
                    <Text style={styles.addressText}>{currentRide.pickup_address}</Text>
                    {(currentRide.status === 'accepted' || currentRide.status === 'driver_arrived') && (
                      <TouchableOpacity style={styles.inlineDirectionButton} onPress={handleDirectionsToPickup}>
                        <Navigation size={16} color="#2563EB" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.addressItem}>
                  <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                  <View style={styles.addressWithButton}>
                    <Text style={styles.addressText}>{currentRide.destination_address}</Text>
                    {currentRide.status === 'in_progress' && (
                      <TouchableOpacity style={styles.inlineDirectionButton} onPress={handleDirectionsToDestination}>
                        <Navigation size={16} color="#2563EB" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Customer Info */}
              <View style={styles.customerInfo}>
                <User size={20} color="#64748B" />
                <Text style={styles.customerName}>
                  {currentRide.customer?.full_name || 'Customer'}
                </Text>
                <TouchableOpacity style={styles.phoneButton}>
                  <Phone size={16} color="#2563EB" />
                </TouchableOpacity>
              </View>

              {/* Ride Stats */}
              <View style={styles.rideStats}>
                <View style={styles.statItem}>
                  <DollarSign size={16} color="#10B981" />
                  <Text style={styles.statText}>₹{currentRide.fare_amount || 'TBD'}</Text>
                </View>
                <View style={styles.statItem}>
                  <MapPin size={16} color="#64748B" />
                  <Text style={styles.statText}>
                    {currentRide.status === 'in_progress' 
                      ? `${formatDistance(currentRide.distance_km)} (Live)` 
                      : formatDistance(currentRide.distance_km)
                    }
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Clock size={16} color="#64748B" />
                  <Text style={styles.statText}>
                    {currentRide.status === 'in_progress' 
                      ? 'Live' 
                      : `${currentRide.duration_minutes || 'TBD'}min`
                    }
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {currentRide.status === 'accepted' && (
                <>
                  <TouchableOpacity style={styles.arrivedButton} onPress={handleDriverArrived}>
                    <Navigation size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Mark as Arrived</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRide}>
                    <XCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentRide.status === 'driver_arrived' && (
                <>
                  <TouchableOpacity style={styles.otpButton} onPress={handleGeneratePickupOTP}>
                    <AlertCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Send OTP to Customer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyPickupOTP}>
                    <CheckCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Enter Customer OTP</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentRide.status === 'in_progress' && (
                <TouchableOpacity 
                  style={styles.completeButton}
                  onPress={handleCompleteRide}
                >
                  <CheckCircle size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Complete Ride</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* No Current Ride */}
        {!currentRide && driver?.status === 'online' && (
          <View style={styles.noRideCard}>
            <Car size={48} color="#CBD5E1" />
            <Text style={styles.noRideTitle}>Ready for Rides</Text>
            <Text style={styles.noRideText}>
              You're online and ready to receive ride requests
            </Text>
          </View>
        )}

        {!currentRide && driver?.status === 'offline' && (
          <View style={styles.noRideCard}>
            <Power size={48} color="#CBD5E1" />
            <Text style={styles.noRideTitle}>You're Offline</Text>
            <Text style={styles.noRideText}>
              Turn on your status to start receiving ride requests
            </Text>
          </View>
        )}

        {/* Pending Requests Count */}
        {pendingRides.length > 0 && (
          <View style={styles.pendingCard}>
            <AlertCircle size={20} color="#F59E0B" />
            <Text style={styles.pendingText}>
              {pendingRides.length} pending ride request{pendingRides.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Ride Request Modal */}
      <RideRequestModal
        visible={showRideRequestModal}
        ride={selectedRideRequest}
        onAccept={handleAcceptRide}
        onDecline={handleDeclineRide}
        onClose={() => {
          setShowRideRequestModal(false);
          setSelectedRideRequest(null);
        }}
      />

      {/* OTP Modal */}
      <OTPModal
        visible={showOTPModal}
        type={otpModalType}
        currentOTP={currentOTP}
        onVerify={handleOTPVerification}
        onClose={() => setShowOTPModal(false)}
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
  headerRight: {
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
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDetails: {
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
    flex: 1,
  },
  trackingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  trackingText: {
    fontSize: 12,
    color: '#64748B',
  },
  currentRideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rideTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  rideStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rideStatusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rideDetails: {
    marginBottom: 20,
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
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  addressWithButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineDirectionButton: {
    width: 32,
    height: 32,
    backgroundColor: '#EBF4FF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginLeft: 3,
    marginBottom: 8,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 8,
    flex: 1,
  },
  phoneButton: {
    width: 32,
    height: 32,
    backgroundColor: '#EBF4FF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  arrivedButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpButton: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  noRideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 16,
  },
  noRideTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 16,
    marginBottom: 8,
  },
  noRideText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  pendingCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pendingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
  progressContainer: {
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  progressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStepText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  progressLabel: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    width: 60,
  },
  directionButton: {
    backgroundColor: '#EBF4FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  directionButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});