import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { CircleCheck as CheckCircle, MapPin, Clock, DollarSign, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface TripCompletionModalProps {
  visible: boolean;
  tripData: {
    distance: number;
    duration: number;
    fareBreakdown: {
      base_fare: number;
      distance_fare: number;
      time_fare?: number;
      hourly_fare?: number;
      total_fare: number;
      per_km_rate: number;
      hourly_rate?: number;
      per_minute_rate?: number;
      platform_fee?: number;
    };
    pickup_address: string;
    destination_address: string;
    booking_type: string;
    rental_hours?: number;
  };
  onClose: () => void;
}

export default function TripCompletionModal({
  visible,
  tripData,
  onClose,
}: TripCompletionModalProps) {
  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

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
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.title}>Trip Completed!</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Trip Summary */}
          <View style={styles.tripSummary}>
            <View style={styles.summaryRow}>
              <MapPin size={20} color="#64748B" />
              <Text style={styles.summaryLabel}>Distance:</Text>
              <Text style={styles.summaryValue}>{tripData.distance.toFixed(2)} km (Actual)</Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Clock size={20} color="#64748B" />
              <Text style={styles.summaryLabel}>Duration:</Text>
              <Text style={styles.summaryValue}>{tripData.duration} minutes (Actual)</Text>
            </View>
          </View>

          {/* Route Details */}
          <View style={styles.routeSection}>
            <Text style={styles.sectionTitle}>Route Details</Text>
            <View style={styles.addressContainer}>
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.addressText}>{tripData.pickup_address}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.addressText}>{tripData.destination_address}</Text>
              </View>
            </View>
          </View>

          {/* Fare Breakdown */}
          <View style={styles.fareSection}>
            <Text style={styles.sectionTitle}>Fare Breakdown</Text>
            
            <View style={styles.fareItem}>
              <Text style={styles.fareLabel}>Base Fare</Text>
              <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.base_fare)}</Text>
            </View>

            {tripData.booking_type === 'rental' && tripData.fareBreakdown.hourly_fare ? (
              <View style={styles.fareItem}>
                <Text style={styles.fareLabel}>
                  Rental ({tripData.rental_hours}h × ₹{tripData.fareBreakdown.hourly_rate})
                </Text>
                <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.hourly_fare)}</Text>
              </View>
            ) : (
              <>
                <View style={styles.fareItem}>
                  <Text style={styles.fareLabel}>
                    Distance ({tripData.distance.toFixed(2)} km × ₹{tripData.fareBreakdown.per_km_rate}/km)
                  </Text>
                  <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.distance_fare)}</Text>
                </View>
                
                {tripData.fareBreakdown.time_fare && tripData.fareBreakdown.time_fare > 0 && (
                  <View style={styles.fareItem}>
                    <Text style={styles.fareLabel}>
                      Time ({tripData.duration} min × ₹{tripData.fareBreakdown.per_minute_rate}/min)
                    </Text>
                    <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.time_fare)}</Text>
                  </View>
                )}
                
                {tripData.fareBreakdown.platform_fee && tripData.fareBreakdown.platform_fee > 0 && (
                  <View style={styles.fareItem}>
                    <Text style={styles.fareLabel}>Platform Fee</Text>
                    <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.platform_fee)}</Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.separator} />
            
            <View style={styles.totalFareItem}>
              <Text style={styles.totalFareLabel}>Total Fare</Text>
              <Text style={styles.totalFareValue}>{formatCurrency(tripData.fareBreakdown.total_fare)}</Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  closeButton: {
    padding: 8,
  },
  tripSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#64748B',
    marginLeft: 12,
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  routeSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  addressContainer: {
    backgroundColor: '#F9FAFB',
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
    marginTop: 4,
    marginRight: 12,
  },
  addressText: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
    lineHeight: 20,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 5,
    marginVertical: 8,
  },
  fareSection: {
    marginBottom: 20,
  },
  fareItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  fareLabel: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
  },
  fareValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  totalFareItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  totalFareLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  totalFareValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  doneButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
              