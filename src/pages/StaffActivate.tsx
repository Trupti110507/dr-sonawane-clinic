import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Field, { Notice } from '../components/Field';
import { friendlyError } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { btnPrimary, card, pageTitle, textLink } from '../lib/ui';

/**
 * A doctor or administrator who has been invited sets their own password
 * here. The database refuses any email that an admin has not invited.
 */
export default function StaffActivate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter the email address the clinic invited.';
    if (password.length < 10) next.password = 'Use at least 10 characters.';
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/sign-in` },
    });
    setBusy(false);
    if (error) setFormError(friendlyError(error));
    // Supabase hides whether an email exists: an existing account comes back with no identities.
    else if (data.user && data.user.identities?.length === 0)
      setFormError('This email already has an account. Use "Sign in", or "Forgot password".');
    else setSent(true);
  }

  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <h1 className={pageTitle}>Activate your staff account</h1>
      <div className={`${card} mt-6`}>
        {sent ? (
          <div className="space-y-4">
            <Notice kind="success">
              Check your inbox. We sent a confirmation link to <strong>{email.trim()}</strong>. Open it to
              finish, then sign in.
            </Notice>
            <Link to="/sign-in" className={textLink}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <p className="text-muted">
              For doctors and administrators invited by the clinic. Patients do not need this page.
            </p>
            <Field label="Email" hint="The address the clinic administrator invited" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            <Field label="Choose a password" hint="At least 10 characters" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
            <Field label="Type the password again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
            {formError && <Notice kind="error">{formError}</Notice>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {busy ? 'Creating account…' : 'Activate account'}
            </button>
            <p className="text-[0.95rem]">
              <Link to="/sign-in" className={textLink}>
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
