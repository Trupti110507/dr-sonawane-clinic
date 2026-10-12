import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, clock24, shortDate, timeOf, weekdayOf } from '../lib/appointments';
import { friendlyError } from '../lib/auth';
import { clinicDate, formatDate, sessionLabel, type ClinicData } from '../lib/clinic';
import { supabase } from '../lib/supabase';
import { Notice } from './Field';
import { tr } from '../lib/i18n';

interface Props {
  clinic: ClinicData;
  doctorId: string;
  serviceId: string;
  /** When moving an appointment, its own slot counts as free */
  excludeId?: string;
  /** The chosen start time (ISO), or '' */
  value: string;
  onChange: (slotStart: string) => void;
  /** Change this number to make the picker fetch the slots again */
  refreshKey?: number;
}

/** Pick a day, then one of the free times the database offers for it. */
export default function SlotPicker({ clinic, doctorId, serviceId, excludeId, value, onChange, refreshKey = 0 }: Props) {
  const { settings, hours, holidays } = clinic;
  const today = clinicDate(settings.timezone);
  const windowDays = settings.booking_window_days ?? 30;

  // Every day in the booking window, marked open or closed.
  const days = useMemo(() => {
    const closedWeekdays = new Set(hours.filter((h) => h.is_closed || !h.opens_at).map((h) => h.weekday));
    const holidayDates = new Map(holidays.map((h) => [h.holiday_date, h.reason]));
    return Array.from({ length: windowDays + 1 }, (_, i) => {
      const date = addDays(today, i);
      const holiday = holidayDates.get(date);
      return { date, closed: closedWeekdays.has(weekdayOf(date)) || Boolean(holiday), holiday };
    });
  }, [hours, holidays, today, windowDays]);

  const [date, setDate] = useState(() => days.find((d) => !d.closed)?.date ?? today);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    const mine = ++request.current;
    setSlots(null);
    setError('');
    supabase
      .rpc('available_slots', { p_doctor_id: doctorId, p_service_id: serviceId, p_date: date, p_exclude_id: excludeId ?? null })
      .then(({ data, error: failed }) => {
        if (mine !== request.current) return; // a newer request has replaced this one
        if (failed) setError(friendlyError(failed));
        setSlots(((data as { slot_start: string }[]) ?? []).map((r) => r.slot_start));
      });
  }, [doctorId, serviceId, date, excludeId, refreshKey]);

  // Group the times the way the clinic day is split: before the break, and after it.
  const dayHours = hours.find((h) => h.weekday === weekdayOf(date));
  const breakStart = dayHours?.break_start && dayHours.break_end ? dayHours.break_start.slice(0, 5) : null;
  const clock = (iso: string) => clock24(iso, settings.timezone);
  const groups = breakStart
    ? [
        { label: sessionLabel(dayHours!.opens_at ?? '00:00'), list: (slots ?? []).filter((x) => clock(x) < breakStart) },
        { label: sessionLabel(dayHours!.break_end!), list: (slots ?? []).filter((x) => clock(x) >= breakStart) },
      ]
    : [{ label: tr('Available', 'उपलब्ध'), list: slots ?? [] }];

  return (
    <div>
      <p className="font-semibold text-ink">{tr('Day', 'दिवस')}</p>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-3" role="group" aria-label={tr('Choose a day', 'दिवस निवडा')}>
        {days.map((d) => {
          const s = shortDate(d.date);
          const active = d.date === date;
          return (
            <button
              key={d.date}
              type="button"
              disabled={d.closed}
              aria-pressed={active}
              aria-label={`${formatDate(d.date)}${d.closed ? `, ${tr('closed', 'बंद')}${d.holiday ? ` (${d.holiday})` : ''}` : ''}`}
              onClick={() => {
                setDate(d.date);
                onChange('');
              }}
              className={`flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-2xl border text-center ${
                active
                  ? 'border-sage-600 bg-sage-600 text-white'
                  : d.closed
                    ? 'cursor-not-allowed border-line bg-[#f4f5f4] text-[#9aa19c]'
                    : 'border-sage-200 bg-white text-ink hover:bg-sage-50'
              }`}
            >
              <span className="text-sm">{d.date === today ? tr('Today', 'आज') : s.weekday}</span>
              <span className="text-xl font-bold leading-tight">{s.day}</span>
              <span className="text-sm">{s.month}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 font-semibold text-ink">{tr(`Time on ${formatDate(date)}`, `${formatDate(date)} रोजी वेळ`)}</p>
      {error && (
        <div className="mt-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {slots === null ? (
        <p role="status" className="mt-2 text-muted">{tr('Checking free times…', 'मोकळ्या वेळा तपासत आहे…')}</p>
      ) : slots.length === 0 ? (
        !error && <p className="mt-2 text-muted">{tr('No free times on this day. Please choose another day.', 'या दिवशी मोकळी वेळ नाही. कृपया दुसरा दिवस निवडा.')}</p>
      ) : (
        <div className="mt-2 space-y-4">
          {groups
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <div key={g.label}>
                <p className="text-[0.95rem] text-muted">{g.label}</p>
                <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" role="group" aria-label={`${g.label} ${tr('times', 'वेळा')}`}>
                  {g.list.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={s === value}
                      onClick={() => onChange(s)}
                      className={`min-h-11 rounded-full border px-2 text-[0.95rem] font-semibold ${
                        s === value ? 'border-sage-600 bg-sage-600 text-white' : 'border-sage-200 bg-white text-sage-700 hover:bg-sage-50'
                      }`}
                    >
                      {timeOf(s, settings.timezone)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
