import { supabase } from './supabase';

export interface ClinicSettings {
  name: string;
  tagline: string | null;
  logo_path: string | null;
  address: string;
  city: string;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  primary_color: string;
  accent_color: string;
  timezone: string;
}

export interface WorkingDay {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  is_closed: boolean;
  opens_at: string | null; // "09:00:00"
  closes_at: string | null;
  break_start: string | null;
  break_end: string | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price_inr: number;
}

export interface Doctor {
  id: string;
  full_name: string;
  qualification: string | null;
  specialities: string | null;
  consultation_fee_inr: number | null;
}

export interface ClinicData {
  settings: ClinicSettings;
  hours: WorkingDay[];
  services: Service[];
  doctors: Doctor[];
  /** "live" = read from Supabase. "sample" = built-in data (no .env yet). */
  source: 'live' | 'sample';
}

// ---------------------------------------------------------------------
// Built-in copy of the Stage 1 data. Shown only while Supabase is not
// connected, so the page can be previewed straight after "npm run dev".
// Clinic name, address, phones and hours are real; the rest is SAMPLE.
// ---------------------------------------------------------------------
const openDay = (weekday: number): WorkingDay => ({
  weekday,
  is_closed: false,
  opens_at: '09:00:00',
  closes_at: '22:00:00',
  break_start: '15:00:00',
  break_end: '17:30:00',
});

const SAMPLE: Omit<ClinicData, 'source'> = {
  settings: {
    name: 'Dr. Sonawane Skin Clinic',
    tagline: 'Dermatology and skin care',
    logo_path: null,
    address: 'Besides Gajanan Maharaj Mandir, Vinchur Yeola Road',
    city: 'Yeola',
    phone_primary: '+91 8928774097',
    phone_secondary: '+91 7517301266',
    email: null,
    primary_color: '#4F7358',
    accent_color: '#B9A9D9',
    timezone: 'Asia/Kolkata',
  },
  hours: [
    { weekday: 0, is_closed: true, opens_at: null, closes_at: null, break_start: null, break_end: null },
    ...[1, 2, 3, 4, 5, 6].map(openDay),
  ],
  doctors: [
    { id: 'd1', full_name: 'Doctor 1 (name to be added)', qualification: 'Qualification to be added', specialities: 'Dermatology', consultation_fee_inr: 300 },
    { id: 'd2', full_name: 'Doctor 2 (name to be added)', qualification: 'Qualification to be added', specialities: 'Dermatology', consultation_fee_inr: 300 },
    { id: 'd3', full_name: 'Doctor 3 (name to be added)', qualification: 'Qualification to be added', specialities: 'Dermatology', consultation_fee_inr: 300 },
  ],
  services: [
    { id: 's1', name: 'Skin consultation', description: 'First visit: examination and treatment advice', category: 'Consultation', duration_minutes: 15, price_inr: 300 },
    { id: 's2', name: 'Follow-up consultation', description: 'Review visit within the follow-up period', category: 'Consultation', duration_minutes: 15, price_inr: 200 },
    { id: 's3', name: 'Acne treatment review', description: 'Assessment and treatment plan for acne and scars', category: 'Consultation', duration_minutes: 15, price_inr: 300 },
    { id: 's4', name: 'Hair and scalp consultation', description: 'Hair fall, dandruff and scalp conditions', category: 'Consultation', duration_minutes: 15, price_inr: 300 },
    { id: 's5', name: 'Chemical peel', description: 'Per session, after doctor assessment', category: 'Procedure', duration_minutes: 30, price_inr: 1500 },
    { id: 's6', name: 'Laser hair reduction', description: 'Per session, small area, after doctor assessment', category: 'Procedure', duration_minutes: 45, price_inr: 2500 },
    { id: 's7', name: 'Wart or mole removal', description: 'Per lesion, after doctor assessment', category: 'Procedure', duration_minutes: 30, price_inr: 1000 },
  ],
};

/** Loads everything the welcome page needs. Throws if Supabase is connected but fails. */
export async function loadClinic(): Promise<ClinicData> {
  if (!supabase) return { ...SAMPLE, source: 'sample' };

  const [settings, hours, services, doctors] = await Promise.all([
    supabase.from('clinic_settings').select('*').single(),
    supabase.from('working_hours').select('*').order('weekday'),
    supabase.from('services').select('*').order('sort_order'),
    supabase.from('doctors').select('*').order('sort_order'),
  ]);

  const failed = [settings, hours, services, doctors].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    settings: settings.data as ClinicSettings,
    hours: hours.data as WorkingDay[],
    services: services.data as Service[],
    doctors: doctors.data as Doctor[],
    source: 'live',
  };
}

// ----------------------------- helpers --------------------------------

/** "09:00:00" -> "9:00 am", "17:30:00" -> "5:30 pm" */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** 1500 -> "₹1,500" */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** The sessions of one day, e.g. [["09:00","15:00"],["17:30","22:00"]] */
export function sessionsOf(day: WorkingDay): [string, string][] {
  if (day.is_closed || !day.opens_at || !day.closes_at) return [];
  if (day.break_start && day.break_end) {
    return [
      [day.opens_at, day.break_start],
      [day.break_end, day.closes_at],
    ];
  }
  return [[day.opens_at, day.closes_at]];
}

/** Is the clinic open right now, judged in the clinic's own time zone? */
export function isOpenNow(hours: WorkingDay[], timezone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const day = hours.find((d) => d.weekday === weekday);
  if (!day) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return sessionsOf(day).some(([from, to]) => minutes >= toMin(from) && minutes < toMin(to));
}

/** tel: link without spaces, e.g. "tel:+918928774097" */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

// ------------------------- "today" helpers -----------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? '';
}

/** Current weekday (0 = Sunday) and minutes since midnight, in the clinic's time zone. */
export function clinicNow(timezone: string, now = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** "Morning", "Afternoon" or "Evening", judged by when a session starts. */
export function sessionLabel(from: string): string {
  const start = toMinutes(from);
  if (start < 12 * 60) return 'Morning';
  if (start < 17 * 60) return 'Afternoon';
  return 'Evening';
}

export interface TodayStatus {
  open: boolean;
  weekday: number;
  /** Short headline, e.g. "Open now" or "Opens at 5:30 pm" */
  headline: string;
  /** Supporting line, e.g. "Until 3:00 pm" or "Opens Monday at 9:00 am" */
  detail: string;
  todaySessions: [string, string][];
}

/** What a visitor needs to know right now: is the clinic open, and if not, when next. */
export function todayStatus(hours: WorkingDay[], timezone: string, now = new Date()): TodayStatus {
  const { weekday, minutes } = clinicNow(timezone, now);
  const dayOf = (w: number) => hours.find((d) => d.weekday === w);
  const today = dayOf(weekday);
  const todaySessions = today ? sessionsOf(today) : [];
  const base = { weekday, todaySessions };

  const current = todaySessions.find(([from, to]) => minutes >= toMinutes(from) && minutes < toMinutes(to));
  if (current) {
    return { ...base, open: true, headline: 'Open now', detail: `Until ${formatTime(current[1])}` };
  }

  const laterToday = todaySessions.find(([from]) => toMinutes(from) > minutes);
  if (laterToday) {
    return {
      ...base,
      open: false,
      headline: `Opens at ${formatTime(laterToday[0])}`,
      detail: 'Closed right now',
    };
  }

  for (let step = 1; step <= 7; step++) {
    const w = (weekday + step) % 7;
    const day = dayOf(w);
    const first = day ? sessionsOf(day)[0] : undefined;
    if (first) {
      const when = step === 1 ? 'tomorrow' : weekdayName(w);
      return {
        ...base,
        open: false,
        headline: todaySessions.length ? 'Closed for today' : 'Closed today',
        detail: `Opens ${when} at ${formatTime(first[0])}`,
      };
    }
  }
  return { ...base, open: false, headline: 'Closed', detail: 'Please call the clinic' };
}
