import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { 
  MapPin, 
  Clock, 
  DollarSign, 
  User, 
  Star,
  Navigation,
  Phone,
  X,
  Check
} from 'lucide-react-native';
import { calculateDistance } from '../utils/maps';
import { useLocation } from '../contexts/LocationContext';

const { width, height } = Dimensions.get('window');

interface RideRequestModalProps {
  visible: boolean;
  ride: any;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export default function RideRequestModal({
  visible,
  ride,
  onAccept,
  onDecline,
  onClose,
}: RideRequestModalProps) {
  const { currentLocation } = useLocation();

  if (!ride) return null;

  const getDistanceToPickup = () => {
    if (!currentLocation) return null;
    
    const driverCoords = {
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
    };
    
    const pickupCoords = {
      latitude: parseFloat(ride.pickup_latitude.toString()),
      longitude: parseFloat(ride.pickup_longitude.toString()),
    };
    
    return calculateDistance(driverCoords, pickupCoords);
  };

  const getRideTypeColor = (type: string) => {
    switch (type) {
      case 'rental': return '#8B5CF6';
      case 'outstation': return '#F59E0B';
      case 'airport': return '#06B6D4';
      default: return '#10B981';
    }
  };

  const distance = getDistanceToPickup();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.rideTypeBadge, { backgroundColor: getRideTypeColor(ride.booking_type) }]}>
                <Text style={styles.rideTypeText}>
                  {ride.booking_type.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.newRequestText}>New Ride Request</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Customer Info */}
          <View style={styles.customerSection}>
            <View style={styles.customerInfo}>
              <View style={styles.customerAvatar}>
                <User size={24} color="#64748B" />
              </View>
              <View style={styles.customerDetails}>
                <Text style={styles.customerName}>
                  {ride.customer?.full_name || 'Anonymous Customer'}
                </Text>
                <Text style={styles.customerPhone}>
                  {ride.customer?.phone_number || 'No phone number'}
                </Text>
                <View style={styles.customerRating}>
                  <Star size={14} color="#F59E0B" />
                  <Text style={styles.ratingText}>4.8</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.phoneButton}>
              <Phone size={20} color="#2563EB" />
            </TouchableOpacity>
          </View>

          {/* Trip Details */}
          <View style={styles.tripSection}>
            <View style={styles.addressContainer}>
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                <View style={styles.addressInfo}>
                  <Text style={styles.addressLabel}>Pickup</Text>
                  <Text style={styles.addressText}>{ride.pickup_address || 'Pickup location'}</Text>
                  {ride.pickup_landmark && (
                    <Text style={styles.landmarkText}>Near {ride.pickup_landmark}</Text>
                  )}
                </View>
              </View>
              
              <View style={styles.routeLine} />
              
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                <View style={styles.addressInfo}>
                  <Text style={styles.addressLabel}>Destination</Text>
                  <Text style={styles.addressText}>{ride.destination_address || 'Destination'}</Text>
                  {ride.destination_landmark && (
                    <Text style={styles.landmarkText}>Near {ride.destination_landmark}</Text>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Trip Stats */}
          <View style={styles.statsSection}>
            <View style={styles.statItem}>
              <DollarSign size={20} color="#10B981" />
              <View style={styles.statInfo}>
                <Text style={styles.statValue}>₹{ride.fare_amount || 'TBD'}</Text>
                <Text style={styles.statLabel}>Estimated Fare</Text>
              </View>
            </View>
            
            {distance && (
              <View style={styles.statItem}>
                <Navigation size={20} color="#2563EB" />
                <View style={styles.statInfo}>
                  <Text style={styles.statValue}>{distance.toFixed(1)}km</Text>
                  <Text style={styles.statLabel}>Distance to Pickup</Text>
                </View>
              </View>
            )}
            
            <View style={styles.statItem}>
              <Clock size={20} color="#F59E0B" />
              <View style={styles.statInfo}>
                <Text style={styles.statValue}>
                  {ride.distance_km ? `${ride.distance_km}km` : 'TBD'}
                </Text>
                <Text style={styles.statLabel}>Trip Distance</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.declineButton}
              onPress={onDecline}
            >
              <X size={24} color="#FFFFFF" />
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.acceptButton}
              onPress={onAccept}
            >
              <Check size={24} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>Accept Ride</Text>
            </TouchableOpacity>
          </View>

          {/* Timer */}
          <View style={styles.timerSection}>
            <Clock size={16} color="#F59E0B" />
            <Text style={styles.timerText}>Auto-decline in 30 seconds</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: height * 0.8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rideTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 12,
  },
  rideTypeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  newRequestText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  closeButton: {
    padding: 8,
  },
  subtitleContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    textAlign: 'center',
  },
  customerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerAvatar: {
    width: 48,
    height: 48,
    backgroundColor: '#E2E8F0',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  customerRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 4,
  },
  phoneButton: {
    width: 40,
    height: 40,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripSection: {
    marginBottom: 20,
  },
  addressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    marginTop: 4,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 2,
  },
  landmarkText: {
    fontSize: 12,
    color: '#64748B',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginLeft: 5,
    marginVertical: 8,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statInfo: {
    alignItems: 'center',
    marginTop: 8,
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
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  timerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  timerText: {
    fontSize: 14,
    color: '#F59E0B',
    marginLeft: 8,
    fontWeight: '500',
  },
  instructionsSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  instructionsText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
});