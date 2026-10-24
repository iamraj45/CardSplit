// Supabase client. Accounts and sync are enabled only when both variables are set
// (.env.local for development, Netlify environment variables in production); otherwise
// the app runs in local-only mode exactly as before.
//
// The anon key is designed to be public: every table is protected by Row Level Security
// (supabase/migrations/0001_init.sql). Never put the service-role key in the app.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow so a magic link still works when the email opens in a different browser
        // (common on phones); PKCE would require the same browser that requested it.
        flowType: 'implicit',
      },
    })
  : null;

export const accountsEnabled = Boolean(supabase);
