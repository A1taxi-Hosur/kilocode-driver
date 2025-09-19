import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

// Validate environment variables
function validateEnvironment() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || url === 'your_supabase_url_here' || url === 'undefined' || url.includes('your-project-ref') || url === 'https://your-project-ref.supabase.co') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured. Please check your .env file and restart the development server.');
  }
  
  if (!anonKey || anonKey === 'your_supabase_anon_key_here' || anonKey === 'undefined' || anonKey.includes('your-anon-key') || anonKey === 'your-anon-key-here') {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured. Please check your .env file and restart the development server.');
  }
  
  if (!serviceKey || serviceKey === 'your_supabase_service_role_key_here' || serviceKey === 'undefined' || serviceKey.includes('your-service-role-key') || serviceKey === 'your-service-role-key-here') {
    throw new Error('EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is not configured. Please check your .env file and restart the development server.');
  }
  
  return { url, anonKey, serviceKey };
}

let supabaseUrl: string;
let supabaseAnonKey: string;
let supabaseServiceRoleKey: string;

try {
  const config = validateEnvironment();
  supabaseUrl = config.url;
  supabaseAnonKey = config.anonKey;
  supabaseServiceRoleKey = config.serviceKey;
  console.log('✅ Supabase configuration validated successfully');
} catch (error) {
  console.error('Supabase configuration error:', error.message);
  console.error('❌ Please update your .env file with actual Supabase credentials and restart the development server');
  // Use placeholder values to prevent app crash, but log the error
  supabaseUrl = 'https://placeholder.supabase.co';
  supabaseAnonKey = 'placeholder-key';
  supabaseServiceRoleKey = 'placeholder-key';
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

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