import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field, { Notice } from '../components/Field';
import { STAFF_IDLE_MINUTES, friendlyError, portalPath, useAuth, wasSignedOutForIdleness } from '../lib/auth';
import { telHref, type ClinicSettings } from '../lib/clinic';
import { pinProblem, pinSignIn } from '../lib/patientLogin';
import { supabase } from '../lib/supabase';
import { btnOutline, btnPrimary, card, pageTitle, textLink } from '../lib/ui';

type Tab = 'patient' | 'staff';

const tabLook = (active: boolean) =>
  `min-h-12 flex-1 rounded-full px-4 font-semibold ${
    active ? 'bg-sage-600 text-white' : 'text-sage-700 hover:bg-sage-50'
  }`;

export default function SignIn({ settings }: { settings: ClinicSettings }) {
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
          <div className={`${card} mt-5`}>{tab === 'patient' ? <PatientPinSignIn settings={settings} /> : <StaffSignIn />}</div>
        </>
      )}
    </main>
  );
}

/** A large box for numbers, easy to read and to tap on a phone. */
/**
 * Patients: patient number and 6-digit PIN. First time (or a forgotten PIN):
 * patient number, the setup code from the clinic desk, and a new PIN.
 * If the clinic has switched SMS codes on, that way is offered too.
 */
function PatientPinSignIn({ settings }: { settings: ClinicSettings }) {
  const [mode, setMode] = useState<'pin' | 'setup' | 'sms'>('pin');
  const [patientNo, setPatientNo] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

  function switchTo(next: 'pin' | 'setup' | 'sms') {
    setMode(next);
    setErrors({});
    setFormError('');
    setPin('');
    setCode('');
    setNewPin('');
    setAgain('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const found: Record<string, string> = {};
    if (!/^\d{1,8}$/.test(patientNo)) found.patientNo = 'Enter the patient number from your clinic slip.';
    if (mode === 'pin' && !/^\d{6}$/.test(pin)) found.pin = 'Enter your 6-digit PIN.';
    if (mode === 'setup') {
      if (!/^\d{6}$/.test(code)) found.code = 'Enter the 6-digit setup code from your slip.';
      const problem = pinProblem(newPin);
      if (problem) found.newPin = problem;
      else if (again !== newPin) found.again = 'The two PINs are not the same. Type the new PIN again.';
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (mode === 'pin') await pinSignIn({ action: 'pin', patient_no: patientNo, pin });
      else await pinSignIn({ action: 'setup', patient_no: patientNo, setup_code: code, new_pin: newPin });
      // On success the page moves to the patient portal by itself.
    } catch (failure) {
      setFormError((failure as Error).message);
      setPin('');
    }
    setBusy(false);
  }

  if (mode === 'sms') {
    return (
      <div className="space-y-4">
        <PatientSignIn />
        <button type="button" className={`${btnOutline} w-full`} onClick={() => switchTo('pin')}>
          Sign in with patient number and PIN
        </button>
      </div>
    );
  }

  const pinType = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-muted">
        {mode === 'pin'
          ? 'Use the patient number on your clinic slip and your 6-digit PIN.'
          : 'First time, or forgot your PIN? Use the setup code the clinic gave you, then choose a new 6-digit PIN.'}
      </p>
      <Field label="Patient number" inputMode="numeric" autoComplete="username" className="" value={patientNo} error={errors.patientNo} onChange={(e) => setPatientNo(digits(e.target.value, 8))} style={{ letterSpacing: '0.15em' }} />
      {mode === 'pin' ? (
        <Field label="PIN" type={pinType} inputMode="numeric" autoComplete="current-password" value={pin} error={errors.pin} onChange={(e) => setPin(digits(e.target.value, 6))} />
      ) : (
        <>
          <Field label="Setup code from the clinic" inputMode="numeric" autoComplete="one-time-code" value={code} error={errors.code} onChange={(e) => setCode(digits(e.target.value, 6))} />
          <Field label="Choose a new 6-digit PIN" hint="Not all the same digit, and not 123456" type={pinType} inputMode="numeric" autoComplete="new-password" value={newPin} error={errors.newPin} onChange={(e) => setNewPin(digits(e.target.value, 6))} />
          <Field label="Type the new PIN again" type={pinType} inputMode="numeric" autoComplete="new-password" value={again} error={errors.again} onChange={(e) => setAgain(digits(e.target.value, 6))} />
        </>
      )}
      <label className="flex min-h-11 items-center gap-3 text-ink">
        <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show the PIN while typing
      </label>
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Please wait…' : mode === 'pin' ? 'Sign in' : 'Save PIN and sign in'}
      </button>
      <button type="button" className={`${btnOutline} w-full`} onClick={() => switchTo(mode === 'pin' ? 'setup' : 'pin')}>
        {mode === 'pin' ? 'First time or forgot PIN?' : 'I already have a PIN'}
      </button>
      <p className="text-[0.95rem] text-muted">
        No patient number yet? Ask at the clinic, or call{' '}
        <a href={telHref(settings.phone_primary)} className={textLink}>
          {settings.phone_primary}
        </a>
        . You can also book an appointment without signing in by calling the clinic.
      </p>
      {settings.sms_login && (
        <button type="button" className={`${textLink} text-[0.95rem]`} onClick={() => switchTo('sms')}>
          Sign in with an SMS code instead
        </button>
      )}
    </form>
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
