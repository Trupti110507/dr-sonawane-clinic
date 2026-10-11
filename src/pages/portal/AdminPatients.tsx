import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import CareAccess from '../../components/CareAccess';
import Field, { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import type { Doctor } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface PatientRow {
  user_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
/** "919876543210" -> "+91 98765 43210" */
const showPhone = (p: string | null) => (p && /^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p ? `+${p}` : 'No number');

/** Registered patients: contact details and account status only. No medical information. */
export default function AdminPatients({ doctors }: { doctors: Doctor[] }) {
  const searchId = useId();
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');
  const [accessFor, setAccessFor] = useState('');
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: failed } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone, is_active, created_at')
      .eq('role', 'patient')
      .order('created_at', { ascending: false });
    setError(failed ? friendlyError(failed) : '');
    setRows((data as PatientRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(userId: string, active: boolean) {
    if (!supabase) return;
    setConfirming('');
    const { error: failed } = await supabase.rpc('admin_set_active', { p_user_id: userId, p_active: active });
    if (failed) setError(friendlyError(failed));
    await load();
  }

  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const shown = (rows ?? []).filter(
    (r) => !q || r.full_name.toLowerCase().includes(q) || (digits !== '' && (r.phone ?? '').includes(digits)),
  );

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Patients</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Contact details and account status only. Medical records are visible to the treating doctor, not here.
      </p>

      {notice && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}
      {registering ? (
        <RegisterForm
          onClose={(saved) => {
            setRegistering(false);
            if (saved) {
              setNotice(saved);
              void load();
            }
          }}
        />
      ) : (
        <button className={`${btnPrimary} mt-6`} onClick={() => { setNotice(''); setRegistering(true); }}>
          Register a patient
        </button>
      )}

      <div className="mt-6 max-w-3xl">
        <label htmlFor={searchId} className="block font-semibold text-ink">
          Search by name or mobile number
        </label>
        <input id={searchId} type="search" className={inputBox} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading patients…</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-muted">{rows.length === 0 ? 'No patients have registered yet.' : 'No patient matches that search.'}</p>
      ) : (
        <>
          <p className="mt-6 text-[0.95rem] text-muted">
            {shown.length} {shown.length === 1 ? 'patient' : 'patients'}
          </p>
          <ul className="mt-2 max-w-3xl divide-y divide-line border-y border-line">
            {shown.map((r) => (
              <li key={r.user_id} className="py-4">
               <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {r.full_name || 'Name not given yet'}
                    {!r.is_active && <span className="ml-2 rounded-full bg-[#eceeed] px-2 py-0.5 text-sm font-semibold text-muted">Deactivated</span>}
                  </p>
                  <p className="text-[0.95rem] text-muted">
                    {showPhone(r.phone)}, registered {shortDate(r.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                <button className={btnSmall} aria-expanded={accessFor === r.user_id} aria-label={`Doctor access for ${r.full_name || 'this patient'}`} onClick={() => setAccessFor(accessFor === r.user_id ? '' : r.user_id)}>
                  Doctor access
                </button>
                {!r.is_active ? (
                  <button className={btnSmall} onClick={() => void setActive(r.user_id, true)}>
                    Activate again
                  </button>
                ) : confirming === r.user_id ? (
                  <div className="flex gap-2">
                    <button className={btnDanger} onClick={() => void setActive(r.user_id, false)}>
                      Yes, deactivate
                    </button>
                    <button className={btnSmall} onClick={() => setConfirming('')}>
                      Keep active
                    </button>
                  </div>
                ) : (
                  <button className={btnSmall} onClick={() => setConfirming(r.user_id)}>
                    Deactivate
                  </button>
                )}
                </div>
               </div>
                {accessFor === r.user_id && <CareAccess patientId={r.user_id} patientName={r.full_name} doctors={doctors} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalShell>
  );
}

/** Front desk: register a walk-in patient by name and mobile number. Contact details only. */
function RegisterForm({ onClose }: { onClose: (saved?: string) => void }) {
  const dobId = useId();
  const genderId = useId();
  const consentId = useId();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [again, setAgain] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<{ name?: string; mobile?: string; again?: string; consent?: string }>({});
  const today = new Date().toISOString().slice(0, 10);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const found: typeof problems = {};
    if (name.trim().length < 2) found.name = "Enter the patient's full name.";
    if (!/^[6-9]\d{9}$/.test(mobile)) found.mobile = 'Enter a 10-digit mobile number, without +91 or 0.';
    else if (again !== mobile) found.again = 'The two numbers do not match. Check with the patient and type it again.';
    if (!consent) found.consent = 'Tick the box once the patient has agreed.';
    setProblems(found);
    if (Object.keys(found).length || !supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.functions.invoke('register-patient', {
      body: { full_name: name, mobile, date_of_birth: dob || null, gender: gender || null, consent: true },
    });
    setBusy(false);
    if (failed) {
      let message = '';
      try {
        message = (await (failed as { context?: Response }).context?.json())?.message ?? '';
      } catch {
        message = '';
      }
      return setError(message ? friendlyError({ message }) : 'The patient could not be registered. Check that the registration server function is set up, then try again.');
    }
    onClose(`${name.trim()} is registered. They can sign in later with the mobile number ${mobile}.`);
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-6 max-w-3xl space-y-5 border-sage-300`}>
      <h2 className="font-display text-2xl">Register a patient</h2>
      <p className="text-muted">
        For a patient at the desk who has not signed in on their own phone. Enter contact details only. The mobile number is how the patient will sign in later, so it must be theirs or a family member's.
      </p>
      <Field label="Full name" value={name} maxLength={80} autoComplete="off" error={problems.name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile number" hint="10 digits" prefix="+91" inputMode="numeric" autoComplete="off" value={mobile} error={problems.mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
        <Field label="Mobile number again" hint="Type it a second time to catch mistakes" prefix="+91" inputMode="numeric" autoComplete="off" value={again} error={problems.again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 10))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={dobId} className="block font-semibold text-ink">
            Date of birth
          </label>
          <p className="text-[0.95rem] text-muted">Optional</p>
          <input id={dobId} type="date" className={inputBox} max={today} value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div>
          <label htmlFor={genderId} className="block font-semibold text-ink">
            Gender
          </label>
          <p className="text-[0.95rem] text-muted">Optional</p>
          <select id={genderId} className={inputBox} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Not recorded</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefers not to say</option>
          </select>
        </div>
      </div>
      <div>
        <div className="flex items-start gap-3">
          <input id={consentId} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <label htmlFor={consentId} className="text-ink">
            I have told the patient that the clinic keeps their contact details and medical record to provide their care, and the patient has agreed.
          </label>
        </div>
        {problems.consent && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{problems.consent}</p>}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Registering…' : 'Register patient'}
        </button>
        <button type="button" className={btnOutline} onClick={() => onClose()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
