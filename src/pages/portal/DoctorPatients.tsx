import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '../../components/Field';
import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import { showPhone } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { ageFrom } from '../../lib/records';
import { supabase } from '../../lib/supabase';
import { inputBox, pageTitle } from '../../lib/ui';

interface Row {
  patient_id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  last_visit: string | null;
  next_follow_up: string | null;
  visits: number;
}

/** The patients this doctor treats. Nobody else's patients can appear here. */
export default function DoctorPatients({ clinic }: { clinic: ClinicData }) {
  const searchId = useId();
  const today = clinicDate(clinic.settings.timezone);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase?.rpc('my_patients').then(({ data, error: failed }) => {
      if (failed) setError(friendlyError(failed));
      setRows((data as Row[]) ?? []);
    });
  }, []);

  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const shown = (rows ?? []).filter((r) => !q || r.full_name.toLowerCase().includes(q) || (digits !== '' && (r.phone ?? '').includes(digits)));

  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <h1 className={pageTitle}>My patients</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Patients who have had an appointment with you, or whom the administrator has assigned to you.
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
        !error && <p className="mt-6 text-muted">{rows.length === 0 ? 'You have no patients yet.' : 'No patient matches that search.'}</p>
      ) : (
        <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
          {shown.map((r) => {
            const age = ageFrom(r.date_of_birth, today);
            return (
              <li key={r.patient_id}>
                <Link to={`/doctor/patients/${r.patient_id}`} className="block py-4 hover:bg-sage-50 sm:px-3">
                  <span className="block font-semibold text-ink">
                    {r.full_name || 'Name not given'}
                    {age !== null && <span className="font-normal text-muted">, {age} years</span>}
                  </span>
                  <span className="block text-[0.95rem] text-muted">
                    {showPhone(r.phone)}
                    {r.last_visit ? `, last visit ${formatDate(r.last_visit)}` : ', no visit notes yet'}
                  </span>
                  {r.next_follow_up && (
                    <span className="mt-1 inline-block rounded-full bg-lavender-200 px-2 py-0.5 text-sm font-semibold text-lavender-700">
                      Follow-up {formatDate(r.next_follow_up)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
