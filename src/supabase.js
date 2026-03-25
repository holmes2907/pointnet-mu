import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

console.log('🔍 Supabase env:', { url: !!supabaseUrl, key: !!supabaseAnonKey });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pointnet-auth-token',
    storage: window.localStorage,
    // さらに強力にするオプション
    flowType: 'implicit',
    debug: true
  }
});

console.log('✅ Supabase client created (persistSession + debug ON)');