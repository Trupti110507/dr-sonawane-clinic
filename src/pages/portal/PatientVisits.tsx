import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, pageTitle } from '../../lib/ui';
import { tr } from '../../lib/i18n';

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
      <h1 className={pageTitle}>{tr('My visits', 'माझ्या भेटी')}</h1>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your visits…', 'तुमच्या भेटी लोड होत आहेत…')}</p>
      ) : (
        <>
          {due && (
            <section className={`${card} mt-6 max-w-3xl`}>
              <h2 className="font-display text-2xl">{tr('Follow-up due', 'पुन्हा तपासणीची तारीख')}</h2>
              <p className="mt-2 text-[1.05rem] font-bold text-ink">{formatDate(due)}</p>
              <p className="text-muted">{tr('Your doctor asked to see you again around this date.', 'डॉक्टरांनी या तारखेच्या आसपास पुन्हा भेटायला सांगितले आहे.')}</p>
              <Link to="/book" className={`${btnPrimary} mt-5`}>
                {tr('Book the follow-up', 'पुन्हा तपासणी बुक करा')}
              </Link>
            </section>
          )}
          {rows.length === 0 ? (
            !error && <p className="mt-6 text-muted">{tr('You have no recorded visits yet.', 'अजून कोणतीही भेट नोंदलेली नाही.')}</p>
          ) : (
            <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
              {rows.map((r, i) => (
                <li key={`${r.visit_date}-${i}`} className="py-4">
                  <p className="font-semibold text-ink">{formatDate(r.visit_date)}</p>
                  <p className="text-[0.95rem] text-muted">
                    {r.doctor_name}
                    {r.follow_up_date ? `, ${tr('follow-up', 'पुन्हा तपासणी')} ${formatDate(r.follow_up_date)}` : ''}
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
