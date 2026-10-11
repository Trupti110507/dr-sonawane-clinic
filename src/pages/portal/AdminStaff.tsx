import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError, useAuth, type Profile } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface Invite {
  email: string;
  role: 'doctor' | 'admin';
  full_name: string;
  doctor_id: string | null;
  accepted_at: string | null;
}
interface DoctorListing {
  id: string;
  full_name: string;
}

const roleName = (r: string) => (r === 'admin' ? 'Administrator' : r === 'doctor' ? 'Doctor' : 'Patient');

export default function AdminStaff() {
  const { profile: me } = useAuth();
  const roleId = useId();
  const listingId = useId();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [listings, setListings] = useState<DoctorListing[]>([]);
  const [loadError, setLoadError] = useState('');
  const [ready, setReady] = useState(false);

  const [form, setForm] = useState({ full_name: '', email: '', role: 'doctor', doctor_id: '' });
  const [errors, setErrors] = useState<{ full_name?: string; email?: string }>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(''); // user id or invite email awaiting a second click

  const load = useCallback(async () => {
    if (!supabase) return;
    const [s, i, d] = await Promise.all([
      supabase.from('profiles').select('user_id, role, full_name, phone, email, is_active').in('role', ['doctor', 'admin']).order('full_name'),
      supabase.from('staff_invites').select('email, role, full_name, doctor_id, accepted_at').order('created_at'),
      supabase.from('doctors').select('id, full_name').order('sort_order'),
    ]);
    const failed = [s, i, d].find((r) => r.error);
    setLoadError(failed?.error ? friendlyError(failed.error) : '');
    setStaff((s.data as Profile[]) ?? []);
    setInvites((i.data as Invite[]) ?? []);
    setListings((d.data as DoctorListing[]) ?? []);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = invites.filter((i) => !i.accepted_at);
  const takenListings = new Set(invites.map((i) => i.doctor_id).filter(Boolean));
  const freeListings = listings.filter((l) => !takenListings.has(l.id));

  async function invite(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const next: typeof errors = {};
    if (form.full_name.trim().length < 2) next.full_name = 'Enter the staff member’s full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('invite_staff', {
      p_email: form.email,
      p_role: form.role,
      p_full_name: form.full_name,
      p_doctor_id: form.role === 'doctor' && form.doctor_id ? form.doctor_id : null,
    });
    setBusy(false);
    if (error) {
      setResult({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setResult({
      kind: 'success',
      text: `${form.full_name.trim()} is invited. Ask them to open Sign in > Clinic staff > "First time? Activate your account" and use ${form.email.trim().toLowerCase()}.`,
    });
    setForm({ full_name: '', email: '', role: 'doctor', doctor_id: '' });
    await load();
  }

  async function setActive(userId: string, active: boolean) {
    if (!supabase) return;
    setConfirming('');
    const { error } = await supabase.rpc('admin_set_active', { p_user_id: userId, p_active: active });
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    await load();
  }

  async function cancelInvite(email: string) {
    if (!supabase) return;
    setConfirming('');
    const { error } = await supabase.from('staff_invites').delete().eq('email', email);
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    await load();
  }

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Staff accounts</h1>
      {loadError && (
        <div className="mt-6">
          <Notice kind="error">{loadError}</Notice>
        </div>
      )}

      <section className={`${card} mt-6`} aria-labelledby="invite-title">
        <h2 id="invite-title" className="font-display text-2xl">
          Invite a staff member
        </h2>
        <p className="mt-2 text-muted">
          They choose their own password when they activate the account. You never see it.
        </p>
        <form onSubmit={invite} noValidate className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} />
          <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <div>
            <label htmlFor={roleId} className="block font-semibold text-ink">
              Role
            </label>
            <select id={roleId} className={inputBox} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="doctor">Doctor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {form.role === 'doctor' && (
            <div>
              <label htmlFor={listingId} className="block font-semibold text-ink">
                Listing on the website
              </label>
              <select id={listingId} className={inputBox} value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
                <option value="">Not linked yet</option>
                {freeListings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            {result && (
              <div className="mb-4">
                <Notice kind={result.kind}>{result.text}</Notice>
              </div>
            )}
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Inviting…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10" aria-labelledby="pending-title">
        <h2 id="pending-title" className="font-display text-2xl">
          Waiting to activate
        </h2>
        {ready && pending.length === 0 ? (
          <p className="mt-3 text-muted">No invitations are waiting.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {pending.map((i) => (
              <li key={i.email} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{i.full_name}</p>
                  <p className="break-all text-[0.95rem] text-muted">
                    {roleName(i.role)}, {i.email}
                  </p>
                </div>
                {confirming === i.email ? (
                  <div className="flex gap-2">
                    <button className={btnDanger} onClick={() => void cancelInvite(i.email)}>
                      Yes, cancel invitation
                    </button>
                    <button className={btnSmall} onClick={() => setConfirming('')}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button className={btnSmall} onClick={() => setConfirming(i.email)}>
                    Cancel invitation
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="staff-title">
        <h2 id="staff-title" className="font-display text-2xl">
          Staff
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {staff.map((s) => {
            const isMe = s.user_id === me?.user_id;
            return (
              <li key={s.user_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {s.full_name}
                    {isMe && <span className="ml-2 font-normal text-muted">(you)</span>}
                    {!s.is_active && (
                      <span className="ml-2 rounded-full bg-[#eceeed] px-2 py-0.5 text-sm font-semibold text-muted">
                        Deactivated
                      </span>
                    )}
                  </p>
                  <p className="break-all text-[0.95rem] text-muted">
                    {roleName(s.role)}, {s.email}
                  </p>
                </div>
                {isMe ? null : !s.is_active ? (
                  <button className={btnSmall} onClick={() => void setActive(s.user_id, true)}>
                    Activate again
                  </button>
                ) : confirming === s.user_id ? (
                  <div className="flex gap-2">
                    <button className={btnDanger} onClick={() => void setActive(s.user_id, false)}>
                      Yes, deactivate
                    </button>
                    <button className={btnSmall} onClick={() => setConfirming('')}>
                      Keep active
                    </button>
                  </div>
                ) : (
                  <button className={btnSmall} onClick={() => setConfirming(s.user_id)}>
                    Deactivate
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </PortalShell>
  );
}
