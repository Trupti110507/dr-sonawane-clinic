import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field, { Notice } from '../components/Field';
import { STAFF_IDLE_MINUTES, friendlyError, portalPath, useAuth, wasSignedOutForIdleness } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { btnOutline, btnPrimary, card, pageTitle, textLink } from '../lib/ui';

type Tab = 'patient' | 'staff';

const tabLook = (active: boolean) =>
  `min-h-12 flex-1 rounded-full px-4 font-semibold ${
    active ? 'bg-sage-600 text-white' : 'text-sage-700 hover:bg-sage-50'
  }`;

export default function SignIn() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [idle] = useState(wasSignedOutForIdleness);
  const [tab, setTab] = useState<Tab>(idle ? 'staff' : 'patient');

  // Already signed in (or just finished signing in): go to the right portal.
  useEffect(() => {
    if (!loading && profile) navigate(portalPath(profile.role), { replace: true });
  }, [loading, profile, navigate]);

  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <h1 className={pageTitle}>Sign in</h1>
      {idle && (
        <div className="mt-6">
          <Notice kind="info">You were signed out because the app was not used for {STAFF_IDLE_MINUTES} minutes. Sign in again to continue.</Notice>
        </div>
      )}

      {!supabase ? (
        <div className="mt-6">
          <Notice kind="info">
            Sign-in needs the database connection. Finish Part B of the README (the .env file),
            then restart the app.
          </Notice>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Who is signing in" className="mt-6 flex gap-1 rounded-full border border-line bg-white p-1">
            <button role="tab" aria-selected={tab === 'patient'} className={tabLook(tab === 'patient')} onClick={() => setTab('patient')}>
              Patient
            </button>
            <button role="tab" aria-selected={tab === 'staff'} className={tabLook(tab === 'staff')} onClick={() => setTab('staff')}>
              Clinic staff
            </button>
          </div>
          <div className={`${card} mt-5`}>{tab === 'patient' ? <PatientSignIn /> : <StaffSignIn />}</div>
        </>
      )}
    </main>
  );
}

/** Patients: mobile number, then the 6-digit code sent by SMS. */
function PatientSignIn() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const fullPhone = `+91${phone}`;

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setFieldError('Enter your 10-digit mobile number, without 0 or +91.');
      return;
    }
    setFieldError('');
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({ phone: fullPhone });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
    else setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code from the SMS.');
      return;
    }
    setFieldError('');
    setBusy(true);
    const { error } = await supabase!.auth.verifyOtp({ phone: fullPhone, token: code, type: 'sms' });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
    // On success the page redirects by itself once the profile has loaded.
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} noValidate className="space-y-5">
        <p className="text-muted">
          New and returning patients sign in the same way. We send a one-time code to your phone.
        </p>
        <Field
          label="Mobile number"
          prefix="+91"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          error={fieldError}
        />
        {formError && <Notice kind="error">{formError}</Notice>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? 'Sending code…' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} noValidate className="space-y-5">
      <p className="text-muted">
        We sent a 6-digit code to <span className="font-semibold text-ink">+91 {phone}</span>.
      </p>
      <Field
        label="Code from SMS"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={fieldError}
      />
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <button
        type="button"
        className={`${btnOutline} w-full`}
        onClick={() => {
          setStep('phone');
          setCode('');
          setFieldError('');
          setFormError('');
        }}
      >
        Use a different number
      </button>
    </form>
  );
}

/** Doctors and administrators: email and password. */
function StaffSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter your work email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-muted">For doctors and clinic administrators.</p>
      <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="flex flex-col gap-2 text-[0.95rem] sm:flex-row sm:justify-between">
        <Link to="/reset-password" className={textLink}>
          Forgot password
        </Link>
        <Link to="/staff/activate" className={textLink}>
          First time? Activate your account
        </Link>
      </p>
    </form>
  );
}
