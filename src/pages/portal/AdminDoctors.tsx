import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import ImageUpload from '../../components/ImageUpload';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { formatInr, imageUrl } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface DoctorRow {
  id: string;
  full_name: string;
  qualification: string | null;
  registration_no: string | null;
  specialities: string | null;
  bio: string | null;
  photo_path: string | null;
  consultation_fee_inr: number | null;
  is_active: boolean;
  sort_order: number;
}

const EMPTY = { id: '', full_name: '', qualification: '', registration_no: '', specialities: '', bio: '', photo_path: '', consultation_fee_inr: '' };
type Form = typeof EMPTY;
const COLUMNS = 'id, full_name, qualification, registration_no, specialities, bio, photo_path, consultation_fee_inr, is_active, sort_order';

export default function AdminDoctors({ onChanged }: { onChanged: () => void }) {
  const bioId = useId();
  const [rows, setRows] = useState<DoctorRow[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('doctors').select(COLUMNS).order('sort_order');
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    setRows((data as DoctorRow[]) ?? []);
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
    const fee = Number(form.consultation_fee_inr);
    if (form.full_name.trim().length < 2) next.full_name = 'Enter the doctor’s name.';
    if (form.consultation_fee_inr.trim() !== '' && (!Number.isInteger(fee) || fee < 0 || fee > 100000)) next.consultation_fee_inr = 'Enter the fee in rupees, as a whole number.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const values = {
      full_name: form.full_name.trim(),
      qualification: form.qualification.trim() || null,
      registration_no: form.registration_no.trim() || null,
      specialities: form.specialities.trim() || null,
      bio: form.bio.trim() || null,
      photo_path: form.photo_path || null,
      consultation_fee_inr: form.consultation_fee_inr.trim() === '' ? null : fee,
    };
    setBusy(true);
    const { error } = form.id
      ? await supabase.from('doctors').update(values).eq('id', form.id)
      : await supabase.from('doctors').insert({ ...values, sort_order: Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1 });
    setBusy(false);
    if (error) return setResult({ kind: 'error', text: friendlyError(error) });
    setResult({ kind: 'success', text: form.id ? `${values.full_name} has been updated.` : `${values.full_name} has been added.` });
    setForm(null);
    await load();
    onChanged();
  }

  async function setActive(row: DoctorRow, active: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from('doctors').update({ is_active: active }).eq('id', row.id);
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    else setResult({ kind: 'success', text: active ? `${row.full_name} is shown on the website again.` : `${row.full_name} is hidden from the website.` });
    await load();
    onChanged();
  }

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={pageTitle}>Doctors</h1>
        {!form && (
          <button className={btnPrimary} onClick={() => { setErrors({}); setResult(null); setForm(EMPTY); }}>
            Add a doctor
          </button>
        )}
      </div>
      <p className="mt-3 max-w-3xl text-muted">
        This is how each doctor appears on the website. Their login is created separately, in Staff accounts.
      </p>

      {result && (
        <div className="mt-6 max-w-3xl">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {form && (
        <form onSubmit={save} noValidate className={`${card} mt-6 max-w-3xl space-y-5`}>
          <h2 className="font-display text-2xl">{form.id ? 'Edit doctor' : 'New doctor'}</h2>
          <ImageUpload
            label="Photo"
            hint="Optional. PNG, JPG or WebP, up to 2 MB. Save the form after choosing."
            prefix="doctor"
            round
            currentUrl={imageUrl(form.photo_path)}
            onUploaded={(path) => setForm((f) => (f ? { ...f, photo_path: path } : f))}
          />
          <Field label="Full name" hint="As shown to patients, for example Dr. Meera Kulkarni" value={form.full_name} maxLength={80} onChange={set('full_name')} error={errors.full_name} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Qualification" hint="For example MBBS, MD (Dermatology)" value={form.qualification} maxLength={120} onChange={set('qualification')} />
            <Field label="Registration number" hint="Medical council registration" value={form.registration_no} maxLength={40} onChange={set('registration_no')} />
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
            <Field label="Specialities" value={form.specialities} maxLength={160} onChange={set('specialities')} />
            <Field label="Consultation fee" prefix="₹" inputMode="numeric" value={form.consultation_fee_inr} onChange={(e) => set('consultation_fee_inr')({ target: { value: e.target.value.replace(/\D/g, '') } })} error={errors.consultation_fee_inr} />
          </div>
          <div>
            <label htmlFor={bioId} className="block font-semibold text-ink">
              About
            </label>
            <p className="text-[0.95rem] text-muted">Optional. A few lines about the doctor.</p>
            <textarea id={bioId} rows={3} maxLength={600} className={`${inputBox} py-3`} value={form.bio} onChange={set('bio')} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Add doctor'}
            </button>
            <button type="button" className={btnOutline} onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading doctors…</p>
      ) : (
        <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                {imageUrl(r.photo_path) ? (
                  <img src={imageUrl(r.photo_path)!} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-full bg-sage-100" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {r.full_name}
                    {!r.is_active && <span className="ml-2 rounded-full bg-[#eceeed] px-2 py-0.5 text-sm font-semibold text-muted">Hidden</span>}
                  </p>
                  <p className="text-[0.95rem] text-muted">
                    {[r.qualification, r.consultation_fee_inr !== null ? formatInr(r.consultation_fee_inr) : null].filter(Boolean).join(', ') || 'No details yet'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className={btnSmall}
                  aria-label={`Edit ${r.full_name}`}
                  onClick={() => {
                    setErrors({});
                    setResult(null);
                    setForm({
                      id: r.id,
                      full_name: r.full_name,
                      qualification: r.qualification ?? '',
                      registration_no: r.registration_no ?? '',
                      specialities: r.specialities ?? '',
                      bio: r.bio ?? '',
                      photo_path: r.photo_path ?? '',
                      consultation_fee_inr: r.consultation_fee_inr === null ? '' : String(r.consultation_fee_inr),
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Edit
                </button>
                <button className={btnSmall} aria-label={`${r.is_active ? 'Hide' : 'Show'} ${r.full_name}`} onClick={() => void setActive(r, !r.is_active)}>
                  {r.is_active ? 'Hide' : 'Show'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
