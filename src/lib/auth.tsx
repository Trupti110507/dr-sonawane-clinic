import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'patient' | 'doctor' | 'admin';

export interface Profile {
  user_id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

interface AuthState {
  /** true while we are still finding out who (if anyone) is signed in */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** The home page of each portal. */
export function portalPath(role: Role): string {
  return role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/patient';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  // Which user the loaded profile belongs to ("" = signed out).
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null }>({ userId: '', profile: null });

  const userId = session?.user.id ?? '';

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    // Only store the new session here. Supabase asks us not to call it
    // again from inside this callback.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    if (!supabase || !id) {
      setLoaded({ userId: '', profile: null });
      return;
    }
    // Row Level Security returns only the signed-in person's own row.
    const { data } = await supabase
      .from('profiles')
      .select('user_id, role, full_name, phone, email, is_active')
      .eq('user_id', id)
      .maybeSingle();
    setLoaded({ userId: id, profile: (data as Profile | null) ?? null });
  }, []);

  useEffect(() => {
    void loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionChecked || loaded.userId !== userId,
      session,
      profile: loaded.userId === userId ? loaded.profile : null,
      refreshProfile: () => loadProfile(userId),
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [sessionChecked, loaded, userId, session, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Turns a technical error from Supabase into a sentence a patient or
 * staff member can act on. Database functions raise "CODE: message".
 */
export function friendlyError(error: unknown): string {
  const raw = (error as { message?: string } | null)?.message ?? String(error ?? '');
  const coded = raw.match(/^[A-Z_]+: (.+)$/);
  if (coded) return coded[1].charAt(0).toUpperCase() + coded[1].slice(1) + '.';
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (m.includes('email not confirmed'))
    return 'Please confirm your email first. Open the link we sent to your inbox, then sign in.';
  if (m.includes('database error saving new user') || m.includes('email_not_invited'))
    return 'This email has not been invited by the clinic. Ask the clinic administrator to invite you first.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'This email already has an account. Use "Sign in", or "Forgot password" if you cannot remember it.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('expired') || m.includes('invalid') && m.includes('token'))
    return 'That code is wrong or has expired. Check it, or request a new code.';
  if (m.includes('phone') && (m.includes('provider') || m.includes('disabled') || m.includes('not enabled')))
    return 'Mobile sign-in is not switched on yet. See Part C of the Stage 2 guide.';
  if (m.includes('sms') || m.includes('twilio'))
    return 'We could not send the SMS. Check the SMS settings in Supabase (Stage 2 guide, Part C).';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least')))
    return 'Choose a stronger password: at least 10 characters.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'We could not reach the server. Check your internet connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}
