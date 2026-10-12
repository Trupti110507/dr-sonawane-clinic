import { friendlyError } from './auth';
import { supabase } from './supabase';

/**
 * Patient sign-in with patient number and PIN. The clinic's server function
 * checks the PIN and, if it is right, hands back a session for this browser.
 * The PIN itself is never stored in the browser.
 */
export async function pinSignIn(body: { action: 'pin'; patient_no: string; pin: string } | { action: 'setup'; patient_no: string; setup_code: string; new_pin: string }) {
  if (!supabase) throw new Error('Sign-in needs the database connection.');
  const { data, error } = await supabase.functions.invoke('patient-login', { body });
  if (error) {
    let message = '';
    try {
      message = (await (error as { context?: Response }).context?.json())?.message ?? '';
    } catch {
      message = '';
    }
    throw new Error(message ? friendlyError({ message }) : 'Sign-in is not available right now. Please try again, or call the clinic.');
  }
  const { access_token, refresh_token } = data as { access_token: string; refresh_token: string };
  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) throw new Error(friendlyError(sessionError));
}

/** Same rule as the database: 6 digits, not all the same, not a simple run. */
export function pinProblem(pin: string): string {
  if (!/^\d{6}$/.test(pin)) return 'The PIN must be exactly 6 digits.';
  const runs = ['0123456789', '9876543210'];
  if (/^(\d)\1{5}$/.test(pin) || runs.some((r) => r.includes(pin))) return 'That PIN is too easy to guess. Choose 6 digits that are not all the same or in a row.';
  return '';
}
