import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Field, { FieldError, Notice } from '../../components/Field';
import { friendlyError, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, pageTitle } from '../../lib/ui';

/** First visit only: the patient gives their name and accepts the privacy notice. */
export default function PatientWelcome({ clinicName }: { clinicName: string }) {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; consent?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Enter your full name.';
    if (!consent) next.consent = 'Please tick the box to continue.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('complete_patient_registration', {
      p_full_name: name,
      p_consent: consent,
    });
    if (error) {
      setBusy(false);
      setFormError(friendlyError(error));
      return;
    }
    await refreshProfile();
    navigate('/patient', { replace: true });
  }

  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <h1 className={pageTitle}>Welcome</h1>
      <p className="mt-3 text-muted">One quick step before you use your patient account.</p>
      <form onSubmit={submit} noValidate className={`${card} mt-6 space-y-5`}>
        <Field label="Your full name" hint="As you would like it on prescriptions and receipts" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-primary)]"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={errors.consent ? true : undefined}
            />
            <span>
              I agree that {clinicName} may store my contact details and visit records to provide
              my care. Only I and the clinic staff treating me can see them.
            </span>
          </label>
          {errors.consent && <FieldError>{errors.consent}</FieldError>}
        </div>
        {formError && <Notice kind="error">{formError}</Notice>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
