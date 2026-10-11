import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Both values come from the .env file. They are the PUBLIC project URL and
// the public "anon" key, which are safe in the browser because every table
// is protected by Row Level Security. Secret keys never belong here.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null until the .env file is filled in; the app then shows built-in sample data. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
