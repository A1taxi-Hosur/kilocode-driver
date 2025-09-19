import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { useLocation } from '../contexts/LocationContext';
import { useRide } from '../contexts/RideContext';
import { MapPin, Navigation, Route } from 'lucide-react-native';
import { GOOGLE_MAPS_API_KEY, getDirections, Coordinates } from '../utils/maps';

interface MapViewComponentProps {
  showCurrentRide?: boolean;
  height?: number;
  showRoute?: boolean;
}

export default function MapViewComponent({ 
  showCurrentRide = true, 
  height = 300,
  showRoute = false
}: MapViewComponentProps) {
  const { currentLocation } = useLocation();
  const { currentRide } = useRide();
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [region, setRegion] = useState({
    latitude: 19.0760, // Mumbai default
    longitude: 72.8777,
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

  // Get route when current ride is available and showRoute is enabled
  useEffect(() => {
    if (showRoute && currentRide && currentLocation) {
      loadRoute();
    } else {
      setRouteCoordinates([]);
      setRouteInfo(null);
    }
  }, [showRoute, currentRide, currentLocation]);

  const loadRoute = async () => {
    if (!currentRide || !currentLocation) return;

    try {
      const origin = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      const destination = {
        latitude: parseFloat(currentRide.pickup_latitude.toString()),
        longitude: parseFloat(currentRide.pickup_longitude.toString()),
      };

      const directions = await getDirections(origin, destination);
      
      if (directions && directions.routes.length > 0) {
        const route = directions.routes[0];
        const points = decodePolyline(directions.polyline || '');
        
        setRouteCoordinates(points);
        setRouteInfo({
          distance: directions.distance,
          duration: directions.duration,
        });

        // Adjust map region to fit the route
        if (points.length > 0) {
          const latitudes = points.map(p => p.latitude);
          const longitudes = points.map(p => p.longitude);
          
          const minLat = Math.min(...latitudes);
          const maxLat = Math.max(...latitudes);
          const minLng = Math.min(...longitudes);
          const maxLng = Math.max(...longitudes);
          
          const midLat = (minLat + maxLat) / 2;
          const midLng = (minLng + maxLng) / 2;
          const deltaLat = (maxLat - minLat) * 1.2; // Add padding
          const deltaLng = (maxLng - minLng) * 1.2;
          
          setRegion({
            latitude: midLat,
            longitude: midLng,
            latitudeDelta: Math.max(deltaLat, 0.01),
            longitudeDelta: Math.max(deltaLng, 0.01),
          });
        }
      }
    } catch (error) {
      console.error('Error loading route:', error);
    }
  };

  // Simple polyline decoder
  const decodePolyline = (encoded: string): Coordinates[] => {
    if (!encoded) return [];
    
    const points: Coordinates[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lat += deltaLat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += deltaLng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  // Generate Google Maps Embed URL for web
  const getGoogleMapsEmbedUrl = () => {
    const baseUrl = 'https://www.google.com/maps/embed/v1/view';
    const apiKey = GOOGLE_MAPS_API_KEY;
    
    if (currentRide && showCurrentRide) {
      // Show directions from current location to pickup/destination
      const origin = currentLocation 
        ? `${currentLocation.coords.latitude},${currentLocation.coords.longitude}`
        : '19.0760,72.8777'; // Mumbai default
      
      const isPickupPhase = currentRide.status === 'accepted' || currentRide.status === 'driver_arrived';
      const destination = isPickupPhase
        ? `${currentRide.pickup_latitude},${currentRide.pickup_longitude}`
        : `${currentRide.destination_latitude},${currentRide.destination_longitude}`;
      
      return `https://www.google.com/maps/embed/v1/directions?key=${apiKey}&origin=${origin}&destination=${destination}&mode=driving`;
    } else if (currentLocation) {
      // Show current location
      const center = `${currentLocation.coords.latitude},${currentLocation.coords.longitude}`;
      return `${baseUrl}?key=${apiKey}&center=${center}&zoom=15&maptype=roadmap`;
    } else {
      // Default to Mumbai
      return `${baseUrl}?key=${apiKey}&center=19.0760,72.8777&zoom=12&maptype=roadmap`;
    }
  };

  // For web platform, show a placeholder since react-native-maps doesn't work on web
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <iframe
          src={getGoogleMapsEmbedUrl()}
          style={styles.webMapFrame}
          frameBorder="0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {routeInfo && (
          <View style={styles.routeInfoOverlay}>
            <Text style={styles.routeInfoText}>
              {routeInfo.distance} • {routeInfo.duration}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={region}
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
            pinColor="#2563EB"
          />
        )}

        {/* Route polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#2563EB"
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}

        {/* Current ride markers */}
        {currentRide && showCurrentRide && (
          <>
            <Marker
              coordinate={{
                latitude: parseFloat(currentRide.pickup_latitude.toString()),
                longitude: parseFloat(currentRide.pickup_longitude.toString()),
              }}
              title="Pickup Location"
              description={currentRide.pickup_address}
              pinColor="#10B981"
            />
            
            <Marker
              coordinate={{
                latitude: parseFloat(currentRide.destination_latitude.toString()),
                longitude: parseFloat(currentRide.destination_longitude.toString()),
              }}
              title="Destination"
              description={currentRide.destination_address}
              pinColor="#EF4444"
            />
          </>
        )}
      </MapView>
      
      {/* Route info overlay */}
      {routeInfo && (
        <View style={styles.routeInfoOverlay}>
          <Text style={styles.routeInfoText}>
            {routeInfo.distance} • {routeInfo.duration}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  routeInfoOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeInfoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  webRouteInfo: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#2563EB',
    borderRadius: 6,
  },
  webRouteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  webMapFrame: {
    width: '100%',
    height: '100%',
    border: 'none',
    borderRadius: 12,
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