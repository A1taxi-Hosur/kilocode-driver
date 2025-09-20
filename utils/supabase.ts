import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

// Get environment variables with fallbacks
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabaseServiceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

// Check if configuration is valid
const isConfigured = supabaseUrl !== 'https://placeholder.supabase.co' && 
                    supabaseUrl !== 'https://your-project-ref.supabase.co' &&
                    !supabaseUrl.includes('your-project-ref') &&
                    supabaseAnonKey !== 'placeholder-key' &&
                    supabaseAnonKey !== 'your-anon-key-here' &&
                    !supabaseAnonKey.includes('your-anon-key');

if (!isConfigured) {
  console.warn('⚠️ Supabase not configured. Please update your .env file with actual credentials.');
  console.warn('Current URL:', supabaseUrl);
  console.warn('Key configured:', supabaseAnonKey !== 'placeholder-key');
} else {
  console.log('✅ Supabase configuration validated successfully');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

// Export configuration status for other modules to check
export const isSupabaseConfigured = isConfigured;

export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)