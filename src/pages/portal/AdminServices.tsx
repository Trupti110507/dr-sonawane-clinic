import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { formatInr } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price_inr: number;
  is_active: boolean;
  sort_order: number;
}

const EMPTY = { id: '', name: '', description: '', category: 'Consultation', duration_minutes: '15', price_inr: '' };
type Form = typeof EMPTY;

export default function AdminServices({ onChanged }: { onChanged: () => void }) {
  const categoryId = useId();
  const durationId = useId();
  const [rows, setRows] = useState<ServiceRow[] | null>(null);
  const [form, setForm] = useState<Form | null>(null); // null = form closed
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    // Administrators also see retired services.
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description, category, duration_minutes, price_inr, is_active, sort_order')
      .order('sort_order');
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    setRows((data as ServiceRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || !supabase) return;
    setResult(null);
    const next: typeof errors = {};
    const price = Number(form.price_inr);
    if (form.name.trim().length < 2) next.name = 'Enter the name of the service.';
    else if (rows?.some((r) => r.id !== form.id && r.name.toLowerCase() === form.name.trim().toLowerCase())) next.name = 'A service with this name already exists.';
    if (form.category.trim().length < 2) next.category = 'Enter a group, for example Consultation.';
    if (form.price_inr.trim() === '' || !Number.isInteger(price) || price < 0 || price > 1000000) next.price_inr = 'Enter the fee in rupees, as a whole number.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const values = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim(),
      duration_minutes: Number(form.duration_minutes),
      price_inr: price,
    };
    setBusy(true);
    const { error } = form.id
      ? await supabase.from('services').update(values).eq('id', form.id)
      : await supabase.from('services').insert({ ...values, sort_order: Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1 });
    setBusy(false);
    if (error) return setResult({ kind: 'error', text: friendlyError(error) });
    setResult({ kind: 'success', text: form.id ? `${values.name} has been updated.` : `${values.name} has been added.` });
    setForm(null);
    await load();
    onChanged();
  }

  async function setActive(row: ServiceRow, active: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from('services').update({ is_active: active }).eq('id', row.id);
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    else setResult({ kind: 'success', text: active ? `${row.name} is back on the website.` : `${row.name} is retired and hidden from the website.` });
    await load();
    onChanged();
  }

  const categories = [...new Set((rows ?? []).map((r) => r.category))];

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={pageTitle}>Services and fees</h1>
        {!form && (
          <button className={btnPrimary} onClick={() => { setErrors({}); setResult(null); setForm(EMPTY); }}>
            Add a service
          </button>
        )}
      </div>

      {result && (
        <div className="mt-6 max-w-3xl">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {form && (
        <form onSubmit={save} noValidate className={`${card} mt-6 max-w-3xl space-y-5`}>
          <h2 className="font-display text-2xl">{form.id ? 'Edit service' : 'New service'}</h2>
          <Field label="Name" value={form.name} maxLength={80} onChange={set('name')} error={errors.name} />
          <Field label="Short description" hint="Optional. Shown under the name on the website." value={form.description} maxLength={200} onChange={set('description')} />
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor={categoryId} className="block font-semibold text-ink">
                Group
              </label>
              <input id={categoryId} list={`${categoryId}-list`} className={inputBox} value={form.category} maxLength={40} onChange={set('category')} aria-invalid={errors.category ? true : undefined} />
              <datalist id={`${categoryId}-list`}>
                {['Consultation', 'Procedure', ...categories].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.category && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{errors.category}</p>}
            </div>
            <div>
              <label htmlFor={durationId} className="block font-semibold text-ink">
                Time needed
              </label>
              <select id={durationId} className={inputBox} value={form.duration_minutes} onChange={set('duration_minutes')}>
                {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <Field label="Fee" prefix="₹" inputMode="numeric" value={form.price_inr} onChange={(e) => set('price_inr')({ target: { value: e.target.value.replace(/\D/g, '') } })} error={errors.price_inr} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Add service'}
            </button>
            <button type="button" className={btnOutline} onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading services…</p>
      ) : (
        <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {r.name}
                  {!r.is_active && <span className="ml-2 rounded-full bg-[#eceeed] px-2 py-0.5 text-sm font-semibold text-muted">Retired</span>}
                </p>
                <p className="text-[0.95rem] text-muted">
                  {r.category}, {r.duration_minutes} minutes, <span className="font-semibold text-ink">{formatInr(r.price_inr)}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className={btnSmall}
                  aria-label={`Edit ${r.name}`}
                  onClick={() => {
                    setErrors({});
                    setResult(null);
                    setForm({ id: r.id, name: r.name, description: r.description ?? '', category: r.category, duration_minutes: String(r.duration_minutes), price_inr: String(r.price_inr) });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Edit
                </button>
                <button className={btnSmall} aria-label={`${r.is_active ? 'Retire' : 'Bring back'} ${r.name}`} onClick={() => void setActive(r, !r.is_active)}>
                  {r.is_active ? 'Retire' : 'Bring back'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
