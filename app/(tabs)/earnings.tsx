import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  CreditCard,
  Clock,
  Car
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabaseAdmin } from '../../utils/supabase';

const { width } = Dimensions.get('window');

type RideEarning = {
  id: string;
  ride_code: string;
  fare_amount: number;
  payment_method: string;
  payment_status: string;
  distance_km: number | null;
  duration_minutes: number | null;
  created_at: string;
  pickup_address: string;
  destination_address: string;
  rating: number | null;
  customer?: {
    full_name: string;
  };
};

type EarningsData = {
  today: number;
  week: number;
  month: number;
  totalRides: number;
  avgPerRide: number;
  cashEarnings: number;
  digitalEarnings: number;
  totalDistance: number;
  totalHours: number;
  avgRating: number;
};

export default function EarningsScreen() {
  const { driver } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [earnings, setEarnings] = useState<EarningsData>({
    today: 0,
    week: 0,
    month: 0,
    totalRides: 0,
    avgPerRide: 0,
    cashEarnings: 0,
    digitalEarnings: 0,
    totalDistance: 0,
    totalHours: 0,
    avgRating: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<RideEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (driver) {
      loadEarningsData();
    }
  }, [driver]);

  const loadEarningsData = async () => {
    if (!driver?.id) return;

    try {
      console.log('=== LOADING EARNINGS DATA ===');
      console.log('Driver ID:', driver.id);
      
      // Fetch all completed rides for this driver
      const { data: rides, error } = await supabaseAdmin
        .from('rides')
        .select(`
          id,
          ride_code,
          fare_amount,
          payment_method,
          payment_status,
          distance_km,
          duration_minutes,
          created_at,
          pickup_address,
          destination_address,
          rating,
          customer:users!rides_customer_id_fkey(
            full_name
          )
        `)
        .eq('driver_id', driver.id)
        .eq('status', 'completed')
        .not('fare_amount', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading earnings:', error);
        return;
      }

      const completedRides = rides || [];
      console.log(`✅ Loaded ${completedRides.length} completed rides`);

      // Calculate date ranges
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Calculate earnings by period
      let todayEarnings = 0;
      let weekEarnings = 0;
      let monthEarnings = 0;
      let cashTotal = 0;
      let digitalTotal = 0;
      let totalDistance = 0;
      let totalDuration = 0;
      let totalRatings = 0;
      let ratedRides = 0;

      completedRides.forEach(ride => {
        const rideDate = new Date(ride.created_at);
        const fareAmount = ride.fare_amount || 0;

        // Add to total earnings
        if (rideDate >= monthStart) monthEarnings += fareAmount;
        if (rideDate >= weekStart) weekEarnings += fareAmount;
        if (rideDate >= todayStart) todayEarnings += fareAmount;

        // Payment method totals
        if (ride.payment_method === 'cash') {
          cashTotal += fareAmount;
        } else {
          digitalTotal += fareAmount;
        }

        // Distance and duration
        if (ride.distance_km) totalDistance += ride.distance_km;
        if (ride.duration_minutes) totalDuration += ride.duration_minutes;

        // Ratings
        if (ride.rating) {
          totalRatings += ride.rating;
          ratedRides++;
        }
      });

      const totalEarnings = monthEarnings;
      const avgPerRide = completedRides.length > 0 ? totalEarnings / completedRides.length : 0;
      const avgRating = ratedRides > 0 ? totalRatings / ratedRides : 0;
      const totalHours = Math.round(totalDuration / 60 * 10) / 10; // Convert to hours

      const earningsData: EarningsData = {
        today: todayEarnings,
        week: weekEarnings,
        month: monthEarnings,
        totalRides: completedRides.length,
        avgPerRide,
        cashEarnings: cashTotal,
        digitalEarnings: digitalTotal,
        totalDistance: Math.round(totalDistance * 10) / 10,
        totalHours,
        avgRating: Math.round(avgRating * 10) / 10,
      };

      console.log('📊 Calculated earnings:', earningsData);
      setEarnings(earningsData);

      // Set recent transactions (last 10 rides)
      setRecentTransactions(completedRides.slice(0, 10));

    } catch (error) {
      console.error('Exception loading earnings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEarningsData();
    setRefreshing(false);
  };

  const getCurrentPeriodEarnings = () => {
    switch (selectedPeriod) {
      case 'today': return earnings.today;
      case 'week': return earnings.week;
      case 'month': return earnings.month;
      default: return earnings.today;
    }
  };

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'Today';
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(0)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading earnings data...</Text>
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
        <Text style={styles.title}>Earnings</Text>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {(['today', 'week', 'month'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive
                ]}
              >
                {period === 'today' ? 'Today' : period === 'week' ? 'Week' : 'Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Main Earnings Card */}
        <View style={styles.mainEarningsCard}>
          <View style={styles.earningsHeader}>
            <Text style={styles.earningsLabel}>{getPeriodLabel()} Earnings</Text>
            <View style={styles.trendingContainer}>
              <TrendingUp size={20} color="#10B981" />
              <Text style={styles.trendingText}>
                {earnings.totalRides > 0 ? `${earnings.totalRides} rides` : 'No rides'}
              </Text>
            </View>
          </View>
          <Text style={styles.mainEarningsAmount}>
            {formatCurrency(getCurrentPeriodEarnings())}
          </Text>
          <Text style={styles.earningsSubtext}>
            From {selectedPeriod === 'today' ? 'today\'s' : 
                  selectedPeriod === 'week' ? 'this week\'s' : 'this month\'s'} rides
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Car size={24} color="#2563EB" />
            <Text style={styles.statValue}>{earnings.totalRides}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          
          <View style={styles.statCard}>
            <DollarSign size={24} color="#10B981" />
            <Text style={styles.statValue}>{formatCurrency(earnings.avgPerRide)}</Text>
            <Text style={styles.statLabel}>Avg per Ride</Text>
          </View>
          
          <View style={styles.statCard}>
            <Clock size={24} color="#F59E0B" />
            <Text style={styles.statValue}>{earnings.totalHours}hrs</Text>
            <Text style={styles.statLabel}>Online Time</Text>
          </View>
          
          <View style={styles.statCard}>
            <TrendingUp size={24} color="#8B5CF6" />
            <Text style={styles.statValue}>{earnings.avgRating || 'N/A'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentMethodsCard}>
          <Text style={styles.cardTitle}>Payment Breakdown</Text>
          <View style={styles.paymentMethods}>
            <View style={styles.paymentMethod}>
              <CreditCard size={20} color="#2563EB" />
              <View style={styles.paymentMethodInfo}>
                <Text style={styles.paymentMethodLabel}>Digital Payments</Text>
                <Text style={styles.paymentMethodAmount}>
                  {formatCurrency(earnings.digitalEarnings)}
                </Text>
              </View>
            </View>
            
            <View style={styles.paymentMethod}>
              <DollarSign size={20} color="#10B981" />
              <View style={styles.paymentMethodInfo}>
                <Text style={styles.paymentMethodLabel}>Cash Payments</Text>
                <Text style={styles.paymentMethodAmount}>
                  {formatCurrency(earnings.cashEarnings)}
                </Text>
              </View>
            </View>
          </View>
          
          {/* Additional Stats */}
          <View style={styles.additionalStats}>
            <View style={styles.additionalStatItem}>
              <Text style={styles.additionalStatLabel}>Total Distance</Text>
              <Text style={styles.additionalStatValue}>{earnings.totalDistance} km</Text>
            </View>
            <View style={styles.additionalStatItem}>
              <Text style={styles.additionalStatLabel}>Total Hours</Text>
              <Text style={styles.additionalStatValue}>{earnings.totalHours} hrs</Text>
            </View>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.recentTransactionsCard}>
          <Text style={styles.cardTitle}>Recent Transactions</Text>
          {recentTransactions.length > 0 ? (
            recentTransactions.map((ride) => (
              <View key={ride.id} style={styles.transactionItem}>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDate}>
                    {formatDate(ride.created_at)} • {formatTime(ride.created_at)}
                  </Text>
                  <Text style={styles.transactionRoute}>
                    {ride.pickup_address}
                  </Text>
                  <Text style={styles.transactionCustomer}>
                    Customer: {ride.customer?.full_name || 'Anonymous'}
                  </Text>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionType}>
                      {ride.payment_method.toUpperCase()}
                    </Text>
                    <Text style={[
                      styles.transactionStatus,
                      { color: ride.payment_status === 'completed' ? '#10B981' : '#F59E0B' }
                    ]}>
                      {ride.payment_status.toUpperCase()}
                    </Text>
                    {ride.rating && (
                      <Text style={styles.transactionRating}>
                        ⭐ {ride.rating}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.transactionAmount}>
                  {formatCurrency(ride.fare_amount)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyTransactions}>
              <Text style={styles.emptyTransactionsText}>No completed rides yet</Text>
            </View>
          )}
        </View>

        {/* Performance Summary */}
        <View style={styles.performanceCard}>
          <Text style={styles.cardTitle}>Performance Summary</Text>
          <View style={styles.performanceGrid}>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{earnings.totalRides}</Text>
              <Text style={styles.performanceLabel}>Completed Rides</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{earnings.totalDistance} km</Text>
              <Text style={styles.performanceLabel}>Distance Covered</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{earnings.avgRating || 'N/A'}</Text>
              <Text style={styles.performanceLabel}>Average Rating</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{formatCurrency(earnings.avgPerRide)}</Text>
              <Text style={styles.performanceLabel}>Avg Fare/Ride</Text>
            </View>
          </View>
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 24,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#2563EB',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  mainEarningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  earningsLabel: {
    fontSize: 16,
    color: '#64748B',
    marginRight: 12,
  },
  trendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },
  mainEarningsAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  earningsSubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: (width - 44) / 2,
    marginBottom: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  paymentMethodsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  paymentMethods: {
    gap: 16,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentMethodInfo: {
    marginLeft: 12,
    flex: 1,
  },
  paymentMethodLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  paymentMethodAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  additionalStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  additionalStatItem: {
    alignItems: 'center',
  },
  additionalStatLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  additionalStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  recentTransactionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDate: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  transactionRoute: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 2,
  },
  transactionCustomer: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  transactionDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  transactionType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
    marginLeft: 16,
  },
  emptyTransactions: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTransactionsText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  performanceItem: {
    width: (width - 64) / 2,
    alignItems: 'center',
    marginBottom: 16,
  },
  performanceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});