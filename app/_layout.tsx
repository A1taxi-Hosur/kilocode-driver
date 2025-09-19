import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useSegments } from 'expo-router';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocationProvider } from '@/contexts/LocationContext';
import { RideProvider } from '@/contexts/RideContext';
import { useAuth } from '@/contexts/AuthContext';

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const { driver } = useAuth();
  const segments = useSegments();
  const routerInstance = useRouter();

  useEffect(() => {
    if (loading) {
      console.log('Auth still loading...')
      return
    }

    const inAuthGroup = segments[0] === '(auth)';
    console.log('=== NAVIGATION CHECK ===')
    console.log('In auth group:', inAuthGroup)
    console.log('Has session:', !!session)
    console.log('Has driver:', !!driver)
    console.log('Current segments:', segments)
    console.log('Loading state:', loading)

    // Check for either Supabase session OR driver session
    const isAuthenticated = session || driver;
    console.log('Is authenticated:', isAuthenticated)

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      console.log('Redirecting to login - not authenticated')
      routerInstance.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      console.log('Redirecting to main app - authenticated')
      routerInstance.replace('/(tabs)');
    } else {
      console.log('No navigation needed - staying in current route')
    }
  }, [session, driver, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <LocationProvider>
        <RideProvider>
          <RootLayoutNav />
          <StatusBar style="auto" />
        </RideProvider>
      </LocationProvider>
    </AuthProvider>
  );
}