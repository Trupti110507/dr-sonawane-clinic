import { useEffect, useId, useState } from 'react';
import { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { addDays, dayOf, timeOf } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { inputBox, pageTitle } from '../../lib/ui';

interface Entry {
  id: number;
  at: string;
  actor_name: string;
  actor_role: string | null;
  action: string;
  table_name: string;
  patient_name: string | null;
  changed: string | null;
}

const ACTION: Record<string, string> = { view: 'Opened', create: 'Added', update: 'Changed', delete: 'Deleted', grant: 'Gave access to', revoke: 'Removed access to' };
const WHAT: Record<string, string> = {
  patient_record: 'the patient record',
  visits: 'a consultation note',
  patient_clinical_profile: 'the medical summary',
  appointments: 'an appointment',
  care_relationships: 'the record, for a doctor',
  prescriptions: 'a prescription',
  treatment_plans: 'a treatment plan',
  patient_photos: 'a progress photo',
  photo_consents: 'the photo consent',
  payments: 'a payment',
  patients: 'a patient registration',
  patient_logins: 'a sign-in setup code',
};

/** Who opened or changed which patient's record. It shows that something happened, never the medical wording. */
export default function AdminAudit({ clinic }: { clinic: ClinicData }) {
  const tz = clinic.settings.timezone;
  const today = clinicDate(tz);
  const fromId = useId();
  const toId = useId();
  const searchId = useId();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !from || !to) return;
    setRows(null);
    supabase.rpc('list_audit', { p_from: from, p_to: to }).then(({ data, error: failed }) => {
      setError(failed ? friendlyError(failed) : '');
      setRows((data as Entry[]) ?? []);
    });
  }, [from, to]);

  const q = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || r.actor_name.toLowerCase().includes(q) || (r.patient_name ?? '').toLowerCase().includes(q));

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Access log</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Every time a patient record is opened or changed, it is written here. Entries cannot be
        edited or removed. The log never shows what a note says.
      </p>
      <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={fromId} className="block font-semibold text-ink">
            From
          </label>
          <input id={fromId} type="date" className={inputBox} max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor={toId} className="block font-semibold text-ink">
            To
          </label>
          <input id={toId} type="date" className={inputBox} min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        <div>
          <label htmlFor={searchId} className="block font-semibold text-ink">
            Staff or patient name
          </label>
          <input id={searchId} type="search" className={inputBox} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading the log…</p>
      ) : shown.length === 0 ? (
        !error && <p className="mt-6 text-muted">Nothing was recorded in this period{q ? ' for that name' : ''}.</p>
      ) : (
        <>
          <p className="mt-6 text-[0.95rem] text-muted">
            {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
            {rows.length === 1000 ? ' (the newest 1,000 are shown; choose a shorter period to see the rest)' : ''}
          </p>
          <ul className="mt-2 max-w-3xl divide-y divide-line border-y border-line">
            {shown.map((r) => (
              <li key={r.id} className="py-3">
                <p className="text-ink">
                  <span className="font-semibold">{r.actor_name}</span>
                  {r.actor_role ? ` (${r.actor_role})` : ''}: {(ACTION[r.action] ?? r.action).toLowerCase()} {WHAT[r.table_name] ?? r.table_name}
                  {r.patient_name ? ` of ${r.patient_name}` : ''}
                </p>
                <p className="text-[0.95rem] text-muted">
                  {formatDate(dayOf(r.at, tz))}, {timeOf(r.at, tz)}
                  {r.changed ? `. Fields changed: ${r.changed.replace(/_/g, ' ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalShell>
  );
}
