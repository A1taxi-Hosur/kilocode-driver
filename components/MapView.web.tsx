import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useLocation } from '../contexts/LocationContext';
import { useRide } from '../contexts/RideContext';
import { MapPin } from 'lucide-react-native';

interface MapViewComponentProps {
  showCurrentRide?: boolean;
  height?: number;
}

export default function MapViewComponent({ 
  showCurrentRide = true, 
  height = 300 
}: MapViewComponentProps) {
  const { currentLocation } = useLocation();
  const { currentRide } = useRide();

  return (
    <View style={[styles.webMapPlaceholder, { height }]}>
      <MapPin size={48} color="#64748B" />
      <Text style={styles.webMapText}>Map View</Text>
      <Text style={styles.webMapSubtext}>
        {currentLocation 
          ? `Current: ${currentLocation.coords.latitude.toFixed(4)}, ${currentLocation.coords.longitude.toFixed(4)}`
          : 'Location not available'
        }
      </Text>
      {currentRide && showCurrentRide && (
        <View style={styles.webRideInfo}>
          <Text style={styles.webRideText}>Active Ride</Text>
          <Text style={styles.webRideAddress}>
            From: {currentRide.pickup_address}
          </Text>
          <Text style={styles.webRideAddress}>
            To: {currentRide.destination_address}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webMapPlaceholder: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  webMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12,
  },
  webMapSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  webRideInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  webRideText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  webRideAddress: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
});