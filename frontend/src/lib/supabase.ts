import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ?? 'https://scrzziyuruzzhebpzvdl.supabase.co'
).replace(/\/$/, '');

const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabaseAnonKey = configuredAnonKey || 'missing-supabase-anon-key';

export const functionsBaseUrl = (
  import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL ?? `${supabaseUrl}/functions/v1`
).replace(/\/$/, '');

export const isSupabaseConfigured = Boolean(supabaseUrl && configuredAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
