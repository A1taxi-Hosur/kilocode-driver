import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocation } from '../contexts/LocationContext';
import { useRide } from '../contexts/RideContext';
import { GOOGLE_MAPS_API_KEY } from '../utils/maps';

interface MapViewComponentProps {
  height?: number;
  showCurrentRide?: boolean;
}

const MapViewComponent: React.FC<MapViewComponentProps> = ({ 
  height = 300, 
  showCurrentRide = true 
}) => {
  const { currentLocation } = useLocation();
  const { currentRide } = useRide();
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  useEffect(() => {
    if (currentLocation) {
      setRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    }
  }, [currentLocation]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={styles.map}
        region={region}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsTraffic={true}
        googleMapsApiKey={GOOGLE_MAPS_API_KEY}
      >
        {/* Driver's current location */}
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            title="Your Location"
            description="Current driver location"
          />
        )}

        {/* Current ride markers */}
        {currentRide && showCurrentRide && (
          <>
            {currentRide.pickup_latitude && currentRide.pickup_longitude && (
              <Marker
                coordinate={{
                  latitude: currentRide.pickup_latitude,
                  longitude: currentRide.pickup_longitude,
                }}
                title="Pickup Location"
                description={currentRide.pickup_address}
                pinColor="green"
              />
            )}
            
            {currentRide.destination_latitude && currentRide.destination_longitude && (
              <Marker
                coordinate={{
                  latitude: currentRide.destination_latitude,
                  longitude: currentRide.destination_longitude,
                }}
                title="Destination"
                description={currentRide.destination_address}
                pinColor="red"
              />
            )}
          </>
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  map: {
    flex: 1,
  },
});

export default MapViewComponent;