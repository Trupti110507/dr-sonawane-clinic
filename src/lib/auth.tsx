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

/** Doctors and administrators are signed out after this many minutes without using the app. */
export const STAFF_IDLE_MINUTES = 30;
const IDLE_KEY = 'clinic-last-used';
const IDLE_FLAG = 'clinic-signed-out-idle';
/** True once, right after an automatic sign-out, so the sign-in page can explain what happened. */
export function wasSignedOutForIdleness(): boolean {
  const yes = sessionStorage.getItem(IDLE_FLAG) === '1';
  sessionStorage.removeItem(IDLE_FLAG);
  return yes;
}

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
        localStorage.removeItem(IDLE_KEY);
        await supabase?.auth.signOut();
      },
    }),
    [sessionChecked, loaded, userId, session, loadProfile],
  );

  // Staff computers at the clinic are shared: a doctor or administrator who
  // stops using the app is signed out, so the next person cannot open records.
  const staff = value.profile?.role === 'doctor' || value.profile?.role === 'admin';
  useEffect(() => {
    if (!staff || !supabase) return;
    const read = () => Number(localStorage.getItem(IDLE_KEY) ?? 0);
    const leave = () => {
      localStorage.removeItem(IDLE_KEY);
      sessionStorage.setItem(IDLE_FLAG, '1');
      void supabase!.auth.signOut();
    };
    // Coming back after a long gap (closed laptop, reopened browser) counts as idle too.
    const last = read();
    if (last && Date.now() - last > STAFF_IDLE_MINUTES * 60_000) return leave();
    const touch = () => localStorage.setItem(IDLE_KEY, String(Date.now()));
    touch();
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    // The time of last use is shared between tabs, so working in one tab keeps the others signed in.
    const timer = window.setInterval(() => {
      if (Date.now() - read() > STAFF_IDLE_MINUTES * 60_000) leave();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [staff]);

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
