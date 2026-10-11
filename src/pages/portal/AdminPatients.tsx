import { useCallback, useEffect, useId, useState } from 'react';
import CareAccess from '../../components/CareAccess';
import { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import type { Doctor } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnSmall, inputBox, pageTitle } from '../../lib/ui';

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
