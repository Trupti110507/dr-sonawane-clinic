import { clinicDate } from './clinic';
import { supabase } from './supabase';

export type AppointmentStatus = 'booked' | 'completed' | 'cancelled' | 'no_show';

/** One row from the list_appointments database function. */
export interface Appointment {
  id: string;
  starts_at: string; // ISO instant
  ends_at: string;
  status: AppointmentStatus;
  is_follow_up: boolean;
  cancel_reason: string | null;
  doctor_id: string;
  doctor_name: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price_inr: number;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Did not attend',
};

/** Badge colours: booked lavender, completed sage, cancelled grey, no-show amber. */
export const STATUS_LOOK: Record<AppointmentStatus, string> = {
  booked: 'bg-lavender-200 text-lavender-700',
  completed: 'bg-sage-100 text-sage-700',
  cancelled: 'bg-[#eceeed] text-muted',
  no_show: 'bg-[#fbeecb] text-[#7a5200]',
};

/** Appointments between two clinic calendar days (inclusive). Throws on failure. */
export async function listAppointments(from: string, to: string, doctorId?: string): Promise<Appointment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_appointments', {
    p_from: from,
    p_to: to,
    p_doctor_id: doctorId || null,
  });
  if (error) throw error;
  return (data as Appointment[]) ?? [];
}

// ----------------------------- dates and times -----------------------------

/** "2026-10-12" + 3 -> "2026-10-15" */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The clinic calendar day an instant falls on. */
export function dayOf(iso: string, timezone: string): string {
  return clinicDate(timezone, new Date(iso));
}

/** Hour (0-23) and minute of an instant, on the clinic's clock. */
function clockParts(iso: string, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour'), minute: get('minute') };
}

/** An instant as clinic clock time, e.g. "5:30 pm". */
export function timeOf(iso: string, timezone: string): string {
  const { hour, minute } = clockParts(iso, timezone);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/** An instant as 24-hour clinic clock time, e.g. "17:30". Sorts and compares as text. */
export function clock24(iso: string, timezone: string): string {
  const { hour, minute } = clockParts(iso, timezone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** A clinic-clock date and time ("2026-10-12", "17:30") as an ISO instant. */
export function clinicInstant(isoDate: string, time: string, timezone: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  // What does the clinic clock show at that UTC moment? The difference is the zone offset.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(wanted));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(wanted - (shown - wanted)).toISOString();
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-12" -> { weekday: "Mon", day: 12, month: "Oct" } */
export function shortDate(isoDate: string): { weekday: string; day: number; month: string } {
  const [, m, d] = isoDate.split('-').map(Number);
  return { weekday: SHORT_DAYS[weekdayOf(isoDate)], day: d, month: SHORT_MONTHS[m - 1] };
}

/** "9198765 43210" style phone for display: "919876543210" -> "+91 98765 43210" */
export function showPhone(p: string | null): string {
  return p && /^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p ? `+${p}` : '';
}
