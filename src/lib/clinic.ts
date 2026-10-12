import { supabase } from './supabase';
import { currentLang, tr } from './i18n';

export interface ClinicSettings {
  name: string;
  /** First line under the name, e.g. the doctor's speciality */
  tagline: string | null;
  /** Second line under the name, e.g. what the clinic offers */
  subtitle?: string | null;
  logo_path: string | null;
  address: string;
  city: string;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  primary_color: string;
  accent_color: string;
  timezone: string;
  /** Length of one appointment slot, in minutes */
  slot_minutes?: number;
  /** How many days ahead patients may book */
  booking_window_days?: number;
  /** True once the administrator has switched online payment on */
  online_payments?: boolean;
  /** True if the clinic has set up SMS codes as a second way for patients to sign in */
  sms_login?: boolean;
  /** The clinic's UPI ID for QR payments, for example drsonawane@okaxis */
  upi_id?: string | null;
  /** The name the bank shows for that UPI ID */
  upi_payee_name?: string | null;
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
  photo_path?: string | null;
}

export interface Holiday {
  holiday_date: string; // "2026-11-08"
  reason: string;
}

export interface ClinicData {
  settings: ClinicSettings;
  hours: WorkingDay[];
  services: Service[];
  doctors: Doctor[];
  holidays: Holiday[];
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
  opens_at: '11:00:00',
  closes_at: '21:00:00',
  break_start: '15:00:00',
  break_end: '17:30:00',
});

const SAMPLE: Omit<ClinicData, 'source'> = {
  settings: {
    name: 'Dr. Sonawane',
    tagline: 'Dermatologist and Venereologist',
    subtitle: 'Skin, Hair, Cosmetic & Laser Clinic',
    logo_path: null,
    address: 'Besides Gajanan Maharaj Mandir, Vinchur Yeola Road',
    city: 'Yeola',
    phone_primary: '+91 8928774097',
    phone_secondary: '+91 7517301266',
    email: null,
    primary_color: '#4F7358',
    accent_color: '#B9A9D9',
    timezone: 'Asia/Kolkata',
    slot_minutes: 15,
    booking_window_days: 30,
  },
  holidays: [],
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

  const [settings, hours, services, doctors, holidays] = await Promise.all([
    supabase.from('clinic_settings').select('*').single(),
    supabase.from('working_hours').select('*').order('weekday'),
    // Only what is switched on: an administrator may read retired rows too,
    // but the public pages must never show them.
    supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('doctors')
      .select('id, full_name, qualification, specialities, consultation_fee_inr, photo_path')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('holidays').select('holiday_date, reason').order('holiday_date'),
  ]);

  const failed = [settings, hours, services, doctors, holidays].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    settings: settings.data as ClinicSettings,
    hours: hours.data as WorkingDay[],
    services: services.data as Service[],
    doctors: doctors.data as Doctor[],
    holidays: (holidays.data as Holiday[]) ?? [],
    source: 'live',
  };
}

// ----------------------------- helpers --------------------------------

/** Name of the public storage folder for the logo and doctor photos. */
export const ASSET_BUCKET = 'clinic-assets';

/** Web address of an uploaded image, or null if there is none. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The clinic logo: the uploaded one if there is one, otherwise the built-in file. */
export function logoUrl(settings: ClinicSettings): string {
  return imageUrl(settings.logo_path) ?? '/logo.png';
}

/** The calendar date in the clinic's time zone, e.g. "2026-10-11" (+ a number of days). */
export function clinicDate(timezone: string, now = new Date(), addDays = 0): string {
  const shifted = new Date(now.getTime() + addDays * 86_400_000);
  // Built from parts, so every browser gives the same YYYY-MM-DD result.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(shifted);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_MR = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];
const DAYS_MR = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

/** Clock time in words people use: "11:00 am", or in Marathi "सकाळी 11:00". */
export function clockText(h: number, m: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${hour12}:${String(m).padStart(2, '0')}`;
  if (currentLang() === 'mr') {
    const part = h < 12 ? 'सकाळी' : h < 16 ? 'दुपारी' : h < 20 ? 'संध्याकाळी' : 'रात्री';
    return `${part} ${time}`;
  }
  return `${time} ${h < 12 ? 'am' : 'pm'}`;
}

/** "2026-11-08" -> "Sunday, 8 November 2026" (written out by hand: browsers disagree on the commas) */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (currentLang() === 'mr') return `${DAYS_MR[day]}, ${d} ${MONTHS_MR[m - 1]} ${y}`;
  return `${DAYS[day]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "09:00:00" -> "9:00 am", "17:30:00" -> "5:30 pm" */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return clockText(h, m);
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
  return (currentLang() === 'mr' ? DAYS_MR : WEEKDAYS)[weekday] ?? '';
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

/** Session name: "Morning" if it starts before noon, otherwise "Afternoon". */
export function sessionLabel(from: string): string {
  return toMinutes(from) < 12 * 60 ? tr('Morning', 'सकाळ') : tr('Afternoon', 'संध्याकाळ');
}

export interface DayGroup {
  /** e.g. "Monday to Saturday" or "Sunday" */
  label: string;
  weekdays: number[];
  sessions: [string, string][];
}

/**
 * Folds the week into rows of neighbouring days that share the same hours,
 * Monday first: "Monday to Saturday" + "Sunday" instead of seven lines.
 */
export function groupWeek(hours: WorkingDay[]): DayGroup[] {
  const week = [...hours].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const groups: DayGroup[] = [];
  for (const day of week) {
    const sessions = sessionsOf(day);
    const last = groups[groups.length - 1];
    if (last && JSON.stringify(last.sessions) === JSON.stringify(sessions)) {
      last.weekdays.push(day.weekday);
    } else {
      groups.push({ label: '', weekdays: [day.weekday], sessions });
    }
  }
  for (const g of groups) {
    const first = weekdayName(g.weekdays[0]);
    const end = weekdayName(g.weekdays[g.weekdays.length - 1]);
    g.label = g.weekdays.length === 1 ? first : `${first} ${tr('to', 'ते')} ${end}`;
  }
  return groups;
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

/**
 * What a visitor needs to know right now: is the clinic open, and if not,
 * when next. Holidays count as closed days.
 */
export function todayStatus(
  hours: WorkingDay[],
  timezone: string,
  now = new Date(),
  holidays: Holiday[] = [],
): TodayStatus {
  const { weekday, minutes } = clinicNow(timezone, now);
  const dayOf = (w: number) => hours.find((d) => d.weekday === w);
  const holidayOn = (addDays: number) =>
    holidays.find((h) => h.holiday_date === clinicDate(timezone, now, addDays));

  const todayHoliday = holidayOn(0);
  const today = dayOf(weekday);
  const todaySessions = today && !todayHoliday ? sessionsOf(today) : [];
  const base = { weekday, todaySessions };

  const current = todaySessions.find(([from, to]) => minutes >= toMinutes(from) && minutes < toMinutes(to));
  if (current) {
    return { ...base, open: true, headline: tr('Open now', 'आता सुरू आहे'), detail: tr(`Until ${formatTime(current[1])}`, `${formatTime(current[1])} पर्यंत`) };
  }

  const laterToday = todaySessions.find(([from]) => toMinutes(from) > minutes);
  if (laterToday) {
    return {
      ...base,
      open: false,
      headline: tr(`Opens at ${formatTime(laterToday[0])}`, `${formatTime(laterToday[0])} वाजता सुरू होईल`),
      detail: tr('Closed right now', 'सध्या बंद'),
    };
  }

  // Look up to two weeks ahead for the next day that is open and not a holiday.
  for (let step = 1; step <= 14; step++) {
    const w = (weekday + step) % 7;
    const day = dayOf(w);
    const first = day && !holidayOn(step) ? sessionsOf(day)[0] : undefined;
    if (first) {
      const date = formatDate(clinicDate(timezone, now, step));
      const opens =
        currentLang() === 'mr'
          ? `${step === 1 ? 'उद्या' : step < 7 ? weekdayName(w) : `${date} रोजी`} ${formatTime(first[0])} वाजता सुरू होईल`
          : `Opens ${step === 1 ? 'tomorrow' : step < 7 ? weekdayName(w) : `on ${date}`} at ${formatTime(first[0])}`;
      return {
        ...base,
        open: false,
        headline: todayHoliday ? tr('Closed today', 'आज बंद') : todaySessions.length ? tr('Closed for today', 'आजसाठी बंद') : tr('Closed today', 'आज बंद'),
        detail: todayHoliday ? `${todayHoliday.reason}. ${opens}` : opens,
      };
    }
  }
  return { ...base, open: false, headline: tr('Closed', 'बंद'), detail: tr('Please call the clinic', 'कृपया क्लिनिकला फोन करा') };
}
