import { useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, weekdayName, type Holiday, type WorkingDay } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

/** One day as the admin edits it: two sessions, the second optional. */
interface DayForm {
  weekday: number;
  closed: boolean;
  from1: string;
  to1: string;
  from2: string;
  to2: string;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

function toForm(day: WorkingDay): DayForm {
  const twoSessions = Boolean(day.break_start && day.break_end);
  return {
    weekday: day.weekday,
    closed: day.is_closed,
    from1: hhmm(day.opens_at),
    to1: twoSessions ? hhmm(day.break_start) : hhmm(day.closes_at),
    from2: twoSessions ? hhmm(day.break_end) : '',
    to2: twoSessions ? hhmm(day.closes_at) : '',
  };
}

function problemWith(d: DayForm): string {
  if (d.closed) return '';
  if (!d.from1 || !d.to1) return 'Enter the morning opening and closing times, or tick Closed.';
  if (d.from1 >= d.to1) return 'The morning closing time must be after the opening time.';
  if (Boolean(d.from2) !== Boolean(d.to2)) return 'Enter both afternoon times, or leave both empty.';
  if (d.from2 && d.from2 <= d.to1) return 'The afternoon must start after the morning ends.';
  if (d.from2 && d.from2 >= d.to2) return 'The afternoon closing time must be after its opening time.';
  return '';
}

interface Props {
  hours: WorkingDay[];
  holidays: Holiday[];
  timezone: string;
  onChanged: () => void;
}

export default function AdminHours({ hours, holidays, timezone, onChanged }: Props) {
  // Monday first, Sunday last.
  const [days, setDays] = useState<DayForm[]>(() =>
    [...hours].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)).map(toForm),
  );
  const [problems, setProblems] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (weekday: number, patch: Partial<DayForm>) =>
    setDays((all) => all.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  function copyFirstToOpenDays() {
    const first = days[0];
    setDays((all) => all.map((d) => (d.closed ? d : { ...first, weekday: d.weekday, closed: false })));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const found: Record<number, string> = {};
    for (const d of days) {
      const p = problemWith(d);
      if (p) found[d.weekday] = p;
    }
    setProblems(found);
    if (Object.keys(found).length || !supabase) return;
    setBusy(true);
    const client = supabase;
    const saved = await Promise.all(
      days.map((d) => {
        const two = Boolean(d.from2 && d.to2);
        // A closed day keeps its last times, so re-opening it is one click.
        const times = d.from1 && d.to1
          ? { opens_at: d.from1, closes_at: two ? d.to2 : d.to1, break_start: two ? d.to1 : null, break_end: two ? d.from2 : null }
          : {};
        return client.from('working_hours').update({ is_closed: d.closed, ...times }).eq('weekday', d.weekday);
      }),
    );
    setBusy(false);
    const failed = saved.find((r) => r.error);
    if (failed?.error) return setResult({ kind: 'error', text: friendlyError(failed.error) });
    setResult({ kind: 'success', text: 'Hours saved. The website shows them now.' });
    onChanged();
  }

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Hours and holidays</h1>

      <form onSubmit={save} noValidate className={`${card} mt-6 max-w-3xl`}>
        <h2 className="font-display text-2xl">Weekly hours</h2>
        <p className="mt-2 text-muted">Leave the afternoon empty on days with a single session.</p>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {days.map((d) => (
            <fieldset key={d.weekday} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <legend className="float-left text-[1.05rem] font-bold text-ink">{weekdayName(d.weekday)}</legend>
                <label className="flex min-h-11 items-center gap-2 font-medium">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={d.closed} onChange={(e) => change(d.weekday, { closed: e.target.checked })} />
                  Closed
                </label>
              </div>
              {!d.closed && (
                <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <TimeRange day={weekdayName(d.weekday)} label="Morning" from={d.from1} to={d.to1} onFrom={(v) => change(d.weekday, { from1: v })} onTo={(v) => change(d.weekday, { to1: v })} />
                  <TimeRange day={weekdayName(d.weekday)} label="Afternoon" from={d.from2} to={d.to2} onFrom={(v) => change(d.weekday, { from2: v })} onTo={(v) => change(d.weekday, { to2: v })} />
                </div>
              )}
              {problems[d.weekday] && <p role="alert" className="mt-2 text-[0.95rem] font-medium text-[#b3261e]">{problems[d.weekday]}</p>}
            </fieldset>
          ))}
        </div>
        {result && (
          <div className="mt-5">
            <Notice kind={result.kind}>{result.text}</Notice>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : 'Save hours'}
          </button>
          <button type="button" className={btnSmall + ' min-h-12'} onClick={copyFirstToOpenDays}>
            Copy {weekdayName(days[0].weekday)} to all open days
          </button>
        </div>
      </form>

      <Holidays holidays={holidays} today={clinicDate(timezone)} onChanged={onChanged} />
    </PortalShell>
  );
}

function TimeRange(p: { day: string; label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div>
      <p className="text-[0.95rem] font-semibold text-muted">{p.label}</p>
      <div className="flex items-center gap-2">
        <input type="time" aria-label={`${p.day} ${p.label} opens`} className={`${inputBox} mt-1`} value={p.from} onChange={(e) => p.onFrom(e.target.value)} />
        <span className="text-muted">to</span>
        <input type="time" aria-label={`${p.day} ${p.label} closes`} className={`${inputBox} mt-1`} value={p.to} onChange={(e) => p.onTo(e.target.value)} />
      </div>
    </div>
  );
}

function Holidays({ holidays, today, onChanged }: { holidays: Holiday[]; today: string; onChanged: () => void }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ date?: string; reason?: string }>({});
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState('');
  const upcoming = holidays.filter((h) => h.holiday_date >= today);

  async function add(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (!date) next.date = 'Choose the date.';
    else if (date < today) next.date = 'Choose today or a later date.';
    else if (holidays.some((h) => h.holiday_date === date)) next.date = 'That date is already on the list.';
    if (reason.trim().length < 2) next.reason = 'Enter a reason, for example Diwali.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    const { error } = await supabase.from('holidays').insert({ holiday_date: date, reason: reason.trim() });
    if (error) return setFormError(friendlyError(error));
    setDate('');
    setReason('');
    onChanged();
  }

  async function remove(holidayDate: string) {
    if (!supabase) return;
    setConfirming('');
    const { error } = await supabase.from('holidays').delete().eq('holiday_date', holidayDate);
    if (error) setFormError(friendlyError(error));
    onChanged();
  }

  return (
    <section className={`${card} mt-6 max-w-3xl`} aria-labelledby="holidays-title">
      <h2 id="holidays-title" className="font-display text-2xl">
        Holidays
      </h2>
      <p className="mt-2 text-muted">Days the clinic is closed. Patients cannot book on these days.</p>
      {upcoming.length === 0 ? (
        <p className="mt-4 text-muted">No holidays are planned.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {upcoming.map((h) => (
            <li key={h.holiday_date} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">{formatDate(h.holiday_date)}</p>
                <p className="text-[0.95rem] text-muted">{h.reason}</p>
              </div>
              {confirming === h.holiday_date ? (
                <div className="flex gap-2">
                  <button className={btnDanger} onClick={() => void remove(h.holiday_date)}>
                    Yes, remove
                  </button>
                  <button className={btnSmall} onClick={() => setConfirming('')}>
                    Keep
                  </button>
                </div>
              ) : (
                <button className={btnSmall} onClick={() => setConfirming(h.holiday_date)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} noValidate className="mt-5 grid gap-5 sm:grid-cols-[12rem_1fr]">
        <Field label="Date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <Field label="Reason" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <div className="sm:col-span-2">
          {formError && (
            <div className="mb-4">
              <Notice kind="error">{formError}</Notice>
            </div>
          )}
          <button type="submit" className={btnPrimary}>
            Add holiday
          </button>
        </div>
      </form>
    </section>
  );
}
