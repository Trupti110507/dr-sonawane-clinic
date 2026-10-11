import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field, { Notice } from '../components/Field';
import { friendlyError, portalPath, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { btnPrimary, card, pageTitle, textLink } from '../lib/ui';

/**
 * Two jobs on one address:
 *  - signed out: ask for an email and send a reset link
 *  - arriving from that link (now signed in): choose a new password
 */
export default function ResetPassword() {
  const { session, profile, loading } = useAuth();
  if (loading) return <p role="status" className="p-10 text-center text-muted">Loading…</p>;
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <h1 className={pageTitle}>{session ? 'Choose a new password' : 'Reset your password'}</h1>
      <div className={`${card} mt-6`}>
        {session ? <NewPassword home={profile ? portalPath(profile.role) : '/'} /> : <RequestLink />}
      </div>
    </main>
  );
}

function RequestLink() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFieldError('Enter your staff email address.');
      return;
    }
    setFieldError('');
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice kind="success">
          If that email has a staff account, a reset link is on its way. Open it on this device.
        </Notice>
        <Link to="/sign-in" className={textLink}>
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-muted">
        For doctors and administrators. Patients sign in with a code sent to their phone and have
        no password.
      </p>
      <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-[0.95rem]">
        <Link to="/sign-in" className={textLink}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function NewPassword({ home }: { home: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (password.length < 10) next.password = 'Use at least 10 characters.';
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
    else navigate(home, { replace: true });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="New password" hint="At least 10 characters" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      <Field label="Type the new password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
