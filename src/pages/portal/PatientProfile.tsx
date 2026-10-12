import { useEffect, useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { friendlyError, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, inputBox, pageTitle } from '../../lib/ui';
import { tr } from '../../lib/i18n';

interface Form {
  full_name: string;
  date_of_birth: string;
  gender: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function PatientProfile() {
  const { profile, refreshProfile } = useAuth();
  const genderId = useId();
  const addressId = useId();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [patientNo, setPatientNo] = useState<number | null>(null);

  useEffect(() => {
    if (!supabase || !profile) return;
    // Row Level Security returns only this patient's own row.
    supabase
      .from('patients')
      .select('patient_no, date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone')
      .eq('profile_id', profile.user_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setResult({ kind: 'error', text: friendlyError(error) });
        setPatientNo(data?.patient_no ?? null);
        setForm({
          full_name: profile.full_name,
          date_of_birth: data?.date_of_birth ?? '',
          gender: data?.gender ?? '',
          address: data?.address ?? '',
          emergency_contact_name: data?.emergency_contact_name ?? '',
          emergency_contact_phone: data?.emergency_contact_phone ?? '',
        });
      });
  }, [profile]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form || !supabase) return;
    setResult(null);
    const next: typeof errors = {};
    if (form.full_name.trim().length < 2) next.full_name = tr('Enter your full name.', 'तुमचे पूर्ण नाव टाका.');
    if (form.date_of_birth && form.date_of_birth > today()) next.date_of_birth = tr('Date of birth cannot be in the future.', 'जन्मतारीख भविष्यातील असू शकत नाही.');
    if (form.emergency_contact_phone && !/^[6-9]\d{9}$/.test(form.emergency_contact_phone))
      next.emergency_contact_phone = tr('Enter a 10-digit mobile number.', '10 अंकी मोबाइल नंबर टाका.');
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase.rpc('update_my_patient_profile', {
      p_full_name: form.full_name,
      p_date_of_birth: form.date_of_birth || null,
      p_gender: form.gender,
      p_address: form.address,
      p_emergency_contact_name: form.emergency_contact_name,
      p_emergency_contact_phone: form.emergency_contact_phone,
    });
    setBusy(false);
    if (error) {
      setResult({ kind: 'error', text: friendlyError(error) });
      return;
    }
    await refreshProfile();
    setResult({ kind: 'success', text: tr('Your profile has been saved.', 'तुमची माहिती सेव्ह झाली.') });
  }

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>{tr('My profile', 'माझी माहिती')}</h1>
      {!form ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your profile…', 'तुमची माहिती लोड होत आहे…')}</p>
      ) : (
        <form onSubmit={submit} noValidate className={`${card} mt-6 max-w-2xl space-y-5`}>
          <p className="text-muted">
            {patientNo !== null && (
              <>
                {tr('Patient number', 'रुग्ण क्रमांक')}: <span className="font-semibold text-ink">{patientNo}</span>.{' '}
              </>
            )}
            {profile?.phone ? (
              <>
                {tr('Mobile number', 'मोबाइल नंबर')}: <span className="font-semibold text-ink">+{profile.phone}</span>.{' '}
              </>
            ) : null}
            {tr('To change these, or your PIN, please ask at the clinic.', 'हे किंवा तुमचा PIN बदलायचा असल्यास क्लिनिकमध्ये विचारा.')}
          </p>
          <Field label={tr('Full name', 'पूर्ण नाव')} autoComplete="name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={tr('Date of birth', 'जन्मतारीख')} type="date" max={today()} value={form.date_of_birth} onChange={set('date_of_birth')} error={errors.date_of_birth} />
            <div>
              <label htmlFor={genderId} className="block font-semibold text-ink">
                {tr('Gender', 'लिंग')}
              </label>
              <select id={genderId} className={inputBox} value={form.gender} onChange={set('gender')}>
                <option value="">{tr('Select', 'निवडा')}</option>
                <option value="female">{tr('Female', 'स्त्री')}</option>
                <option value="male">{tr('Male', 'पुरुष')}</option>
                <option value="other">{tr('Other', 'इतर')}</option>
                <option value="prefer_not_to_say">{tr('Prefer not to say', 'सांगायचे नाही')}</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={addressId} className="block font-semibold text-ink">
              {tr('Address', 'पत्ता')}
            </label>
            <textarea id={addressId} rows={3} maxLength={300} className={`${inputBox} py-3`} value={form.address} onChange={set('address')} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={tr('Emergency contact name', 'आपत्कालीन संपर्क व्यक्तीचे नाव')} value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
            <Field
              label={tr('Emergency contact mobile', 'आपत्कालीन संपर्क मोबाइल')}
              prefix="+91"
              inputMode="numeric"
              maxLength={10}
              value={form.emergency_contact_phone}
              onChange={(e) => set('emergency_contact_phone')({ target: { value: e.target.value.replace(/\D/g, '') } })}
              error={errors.emergency_contact_phone}
            />
          </div>
          {result && <Notice kind={result.kind}>{result.text}</Notice>}
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? tr('Saving…', 'सेव्ह होत आहे…') : tr('Save profile', 'माहिती सेव्ह करा')}
          </button>
        </form>
      )}
    </PortalShell>
  );
}
