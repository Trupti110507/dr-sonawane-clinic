import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, pageTitle } from '../../lib/ui';

export interface VisitSummary {
  visit_date: string;
  doctor_name: string;
  follow_up_date: string | null;
}

/** The patient's own visits: date, doctor and follow-up date. The doctor's notes are not shown here. */
export default function PatientVisits({ clinic }: { clinic: ClinicData }) {
  const today = clinicDate(clinic.settings.timezone);
  const [rows, setRows] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase?.rpc('my_visit_summaries').then(({ data, error: failed }) => {
      if (failed) setError(friendlyError(failed));
      setRows((data as VisitSummary[]) ?? []);
    });
  }, []);

  const due = (rows ?? []).map((r) => r.follow_up_date).filter((d): d is string => Boolean(d) && d! >= today).sort()[0];

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>My visits</h1>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading your visits…</p>
      ) : (
        <>
          {due && (
            <section className={`${card} mt-6 max-w-3xl`}>
              <h2 className="font-display text-2xl">Follow-up due</h2>
              <p className="mt-2 text-[1.05rem] font-bold text-ink">{formatDate(due)}</p>
              <p className="text-muted">Your doctor asked to see you again around this date.</p>
              <Link to="/book" className={`${btnPrimary} mt-5`}>
                Book the follow-up
              </Link>
            </section>
          )}
          {rows.length === 0 ? (
            !error && <p className="mt-6 text-muted">You have no recorded visits yet.</p>
          ) : (
            <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
              {rows.map((r, i) => (
                <li key={`${r.visit_date}-${i}`} className="py-4">
                  <p className="font-semibold text-ink">{formatDate(r.visit_date)}</p>
                  <p className="text-[0.95rem] text-muted">
                    {r.doctor_name}
                    {r.follow_up_date ? `, follow-up ${formatDate(r.follow_up_date)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PortalShell>
  );
}
