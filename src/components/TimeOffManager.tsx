import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { addDays, clinicInstant, dayOf, timeOf } from '../lib/appointments';
import { friendlyError } from '../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../lib/clinic';
import { supabase } from '../lib/supabase';
import { btnDanger, btnPrimary, btnSmall, card, inputBox } from '../lib/ui';
import Field, { Notice } from './Field';

interface TimeOff {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

/**
 * Leave and blocked hours. A doctor manages their own; an administrator
 * chooses the doctor. Patients cannot book into these periods.
 */
export default function TimeOffManager({ clinic, chooseDoctor }: { clinic: ClinicData; chooseDoctor: boolean }) {
  const tz = clinic.settings.timezone;
  const today = clinicDate(tz);
  const doctorSelectId = useId();
  const [rows, setRows] = useState<TimeOff[] | null>(null);
  const [form, setForm] = useState({ doctor_id: '', from_date: '', from_time: '00:00', to_date: '', to_time: '23:59', reason: '' });
  const [errors, setErrors] = useState<{ doctor_id?: string; from_date?: string; to_date?: string }>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    // The database returns only what this person may see: own leave, or all for an admin.
    const { data, error } = await supabase
      .from('doctor_time_off')
      .select('id, doctor_id, starts_at, ends_at, reason')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at');
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    setRows((data as TimeOff[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const doctorName = (id: string) => clinic.doctors.find((d) => d.id === id)?.full_name ?? 'Doctor';

  async function add(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const next: typeof errors = {};
    if (chooseDoctor && !form.doctor_id) next.doctor_id = 'Choose the doctor.';
    if (!form.from_date) next.from_date = 'Choose the first day.';
    if (!form.to_date) next.to_date = 'Choose the last day.';
    else if (form.from_date && `${form.to_date}T${form.to_time}` <= `${form.from_date}T${form.from_time}`) next.to_date = 'The end must be after the start.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_time_off', {
      p_starts_at: clinicInstant(form.from_date, form.from_time || '00:00', tz),
      p_ends_at: clinicInstant(form.to_date, form.to_time || '23:59', tz),
      p_reason: form.reason,
      p_doctor_id: chooseDoctor ? form.doctor_id : null,
    });
    setBusy(false);
    if (error) return setResult({ kind: 'error', text: friendlyError(error) });
    setResult({ kind: 'success', text: 'Time off saved. Patients can no longer book in that period.' });
    setForm({ ...form, from_date: '', to_date: '', reason: '' });
    await load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    setConfirming('');
    const { error } = await supabase.rpc('remove_time_off', { p_id: id });
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    await load();
  }

  const describe = (t: TimeOff) => {
    const d1 = dayOf(t.starts_at, tz);
    const d2 = dayOf(t.ends_at, tz);
    return d1 === d2
      ? `${formatDate(d1)}, ${timeOf(t.starts_at, tz)} to ${timeOf(t.ends_at, tz)}`
      : `${formatDate(d1)}, ${timeOf(t.starts_at, tz)} until ${formatDate(d2)}, ${timeOf(t.ends_at, tz)}`;
  };

  return (
    <>
      <form onSubmit={add} noValidate className={`${card} mt-6 max-w-3xl space-y-5`}>
        <h2 className="font-display text-2xl">Add time off</h2>
        <p className="text-muted">
          For a whole day, keep the times as they are. If patients are already booked in the
          period, move or cancel those appointments first.
        </p>
        {chooseDoctor && (
          <div>
            <label htmlFor={doctorSelectId} className="block font-semibold text-ink">
              Doctor
            </label>
            <select id={doctorSelectId} className={inputBox} value={form.doctor_id} onChange={set('doctor_id')} aria-invalid={errors.doctor_id ? true : undefined}>
              <option value="">Select</option>
              {clinic.doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
            {errors.doctor_id && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{errors.doctor_id}</p>}
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="From day" type="date" min={today} max={addDays(today, 365)} value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value, to_date: form.to_date || e.target.value })} error={errors.from_date} />
          <Field label="From time" type="time" value={form.from_time} onChange={set('from_time')} />
          <Field label="To day" type="date" min={form.from_date || today} max={addDays(today, 365)} value={form.to_date} onChange={set('to_date')} error={errors.to_date} />
          <Field label="To time" type="time" value={form.to_time} onChange={set('to_time')} />
        </div>
        <Field label="Reason" hint="Optional. Only clinic staff see this." value={form.reason} maxLength={120} onChange={set('reason')} />
        {result && <Notice kind={result.kind}>{result.text}</Notice>}
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save time off'}
        </button>
      </form>

      <section className="mt-10 max-w-3xl" aria-labelledby="timeoff-title">
        <h2 id="timeoff-title" className="font-display text-2xl">
          Upcoming time off
        </h2>
        {rows === null ? (
          <p role="status" className="mt-3 text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-muted">No time off is planned.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {chooseDoctor && <p className="font-bold text-ink">{doctorName(t.doctor_id)}</p>}
                  <p className={chooseDoctor ? 'text-ink' : 'font-semibold text-ink'}>{describe(t)}</p>
                  {t.reason && <p className="text-[0.95rem] text-muted">{t.reason}</p>}
                </div>
                {confirming === t.id ? (
                  <div className="flex gap-2">
                    <button className={btnDanger} onClick={() => void remove(t.id)}>
                      Yes, remove
                    </button>
                    <button className={btnSmall} onClick={() => setConfirming('')}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button className={btnSmall} onClick={() => setConfirming(t.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
