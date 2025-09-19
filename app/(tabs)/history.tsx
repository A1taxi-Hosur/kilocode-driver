import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, 
  Clock, 
  DollarSign, 
  Star,
  Calendar,
  Filter,
  TrendingUp,
  Award
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabaseAdmin } from '../../utils/supabase';

type RideHistoryItem = {
  id: string;
  ride_code: string;
  pickup_address: string;
  destination_address: string;
  pickup_landmark?: string;
  destination_landmark?: string;
  booking_type: string;
  vehicle_type: string;
  status: string;
  fare_amount: number | null;
  distance_km: number | null;
  duration_minutes: number | null;
  payment_method: string;
  payment_status: string;
  rating?: number | null;
  created_at: string;
  updated_at: string;
  customer?: {
    full_name: string;
    phone_number: string;
  };
};

export default function HistoryScreen() {
  const { driver } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [rideHistory, setRideHistory] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalRides: 0,
    totalEarnings: 0,
    totalDistance: 0,
    averageRating: 0
  });

  useEffect(() => {
    if (driver) {
      loadRideHistory();
    }
  }, [driver]);

  const loadRideHistory = async () => {
    if (!driver) return;

    try {
      console.log('=== LOADING RIDE HISTORY ===');
      console.log('Driver ID:', driver.id);
      console.log('Driver Name:', driver.user?.full_name);
      
      const { data, error } = await supabaseAdmin
        .from('rides')
        .select(`
          id,
          ride_code,
          pickup_address,
          destination_address,
          pickup_landmark,
          destination_landmark,
          booking_type,
          vehicle_type,
          status,
          fare_amount,
          distance_km,
          duration_minutes,
          payment_method,
          payment_status,
          rating,
          created_at,
          updated_at,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number
          )
        `)
        .eq('driver_id', driver.id)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading ride history:', error);
        setRideHistory([]);
        return;
      }

      const rides = data || [];
      console.log(`✅ Loaded ${rides.length} historical rides`);
      
      // Log some sample rides for debugging
      if (rides.length > 0) {
        console.log('Sample rides:');
        rides.slice(0, 3).forEach((ride, index) => {
          console.log(`${index + 1}. ${ride.ride_code}: ${ride.pickup_address} → ${ride.destination_address} (₹${ride.fare_amount})`);
        });
      }
      
      setRideHistory(data || []);
      
      // Calculate stats
      const completedRides = rides.filter(ride => ride.status === 'completed');
      const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare_amount || 0), 0);
      const totalDistance = completedRides.reduce((sum, ride) => sum + (ride.distance_km || 0), 0);
      const ridesWithRating = completedRides.filter(ride => ride.rating);
      const averageRating = ridesWithRating.length > 0 
        ? ridesWithRating.reduce((sum, ride) => sum + (ride.rating || 0), 0) / ridesWithRating.length
        : 0;
      
      setStats({
        totalRides: completedRides.length,
        totalEarnings,
        totalDistance,
        averageRating
      });
      
      console.log('📊 Stats calculated:', {
        totalRides: completedRides.length,
        totalEarnings,
        totalDistance: totalDistance.toFixed(1),
        averageRating: averageRating.toFixed(1)
      });
      
    } catch (error) {
      console.error('Exception loading ride history:', error);
      setRideHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRideHistory();
    setRefreshing(false);
  };

  const filteredRides = rideHistory.filter(ride => {
    if (selectedFilter === 'all') return true;
    return ride.status === selectedFilter;
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
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#64748B';
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'card': return '💳';
      case 'wallet': return '📱';
      default: return '💵';
    }
  };
  const formatDate = (dateString: string) => {
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

  const formatDuration = (duration: number | null) => {
    if (!duration) return 'N/A';
    const minutes = Math.floor(duration);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  };

  const formatDistance = (distance: number | null) => {
    if (!distance) return 'N/A';
    if (distance < 1) {
      return `${(distance * 1000).toFixed(0)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading ride history...</Text>
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
          <Text style={styles.title}>Ride History</Text>
          <TouchableOpacity style={styles.filterButton}>
            <Filter size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <TrendingUp size={20} color="#10B981" />
            <Text style={styles.statValue}>{stats.totalRides}</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
          
          <View style={styles.statCard}>
            <DollarSign size={20} color="#10B981" />
            <Text style={styles.statValue}>₹{stats.totalEarnings.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
          
          <View style={styles.statCard}>
            <MapPin size={20} color="#2563EB" />
            <Text style={styles.statValue}>{stats.totalDistance.toFixed(0)}km</Text>
            <Text style={styles.statLabel}>Total Distance</Text>
          </View>
          
          <View style={styles.statCard}>
            <Award size={20} color="#F59E0B" />
            <Text style={styles.statValue}>{stats.averageRating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
          </View>
        </View>
        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          {(['all', 'completed', 'cancelled'] as const).map((filter) => (
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
                {filter === 'all' && ` (${rideHistory.length})`}
                {filter === 'completed' && ` (${rideHistory.filter(r => r.status === 'completed').length})`}
                {filter === 'cancelled' && ` (${rideHistory.filter(r => r.status === 'cancelled').length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rides List */}
        {filteredRides.length > 0 ? (
          filteredRides.map((ride) => {
            const dateTime = formatDate(ride.created_at);
            return (
              <View key={ride.id} style={styles.rideCard}>
                <View style={styles.rideHeader}>
                  <View style={styles.rideTypeContainer}>
                    <Text style={styles.rideCode}>#{ride.ride_code}</Text>
                    <View
                      style={[
                        styles.rideTypeBadge,
                        { backgroundColor: getRideTypeColor(ride.booking_type) }
                      ]}
                    >
                      <Text style={styles.rideTypeText}>
                        {ride.booking_type.toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(ride.status) }
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {ride.status.toUpperCase()}
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
                  <Text style={styles.customerLabel}>Customer:</Text>
                  <Text style={styles.customerName}>
                    {ride.customer?.full_name || 'Anonymous'}
                  </Text>
                  {ride.customer?.phone_number && (
                    <Text style={styles.customerPhone}>
                      {ride.customer.phone_number}
                    </Text>
                  )}
                </View>
                <View style={styles.addressContainer}>
                  <View style={styles.addressItem}>
                    <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                    <View style={styles.addressInfo}>
                      <Text style={styles.addressText}>{ride.pickup_address}</Text>
                      {ride.pickup_landmark && (
                        <Text style={styles.landmarkText}>Near {ride.pickup_landmark}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.routeLine} />
                  <View style={styles.addressItem}>
                    <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                    <View style={styles.addressInfo}>
                      <Text style={styles.addressText}>{ride.destination_address}</Text>
                      {ride.destination_landmark && (
                        <Text style={styles.landmarkText}>Near {ride.destination_landmark}</Text>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.rideStats}>
                  <View style={styles.statItem}>
                    <DollarSign size={16} color="#10B981" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>₹{ride.fare_amount || 'N/A'}</Text>
                      <Text style={styles.statSubtext}>
                        {getPaymentMethodIcon(ride.payment_method)} {ride.payment_method.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.statItem}>
                    <MapPin size={16} color="#64748B" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>{formatDistance(ride.distance_km)}</Text>
                      <Text style={styles.statSubtext}>{ride.vehicle_type}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.statItem}>
                    <Clock size={16} color="#64748B" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>{formatDuration(ride.duration_minutes)}</Text>
                      <Text style={styles.statSubtext}>Duration</Text>
                    </View>
                  </View>

                  <View style={styles.statItem}>
                    <Star size={16} color="#F59E0B" />
                    <View style={styles.statInfo}>
                      <Text style={styles.statText}>{ride.rating || 'N/A'}</Text>
                      <Text style={styles.statSubtext}>Rating</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Calendar size={64} color="#CBD5E1" />
            <Text style={styles.emptyStateTitle}>No Rides Yet</Text>
            <Text style={styles.emptyStateText}>
              {selectedFilter === 'all' 
                ? 'Your ride history will appear here once you complete some rides'
                : `No ${selectedFilter} rides found`
              }
            </Text>
          </View>
        )}

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
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
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
  customerLabel: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 8,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  customerPhone: {
    fontSize: 12,
    color: '#64748B',
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
    flex: 1,
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