import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { addDays, dayOf, timeOf } from '../../lib/appointments';
import { useAuth } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { useAppointments } from '../../lib/useAppointments';
import type { VisitSummary } from './PatientVisits';
import { btnOutline, btnPrimary, card, pageTitle } from '../../lib/ui';

export default function PatientHome({ clinic }: { clinic: ClinicData }) {
  const { profile } = useAuth();
  const tz = clinic.settings.timezone;
  const today = clinicDate(tz);
  const { rows } = useAppointments(today, addDays(today, (clinic.settings.booking_window_days ?? 30) + 1));
  const [followUp, setFollowUp] = useState('');
  useEffect(() => {
    supabase?.rpc('my_visit_summaries').then(({ data }) => {
      const due = ((data as VisitSummary[]) ?? []).map((v) => v.follow_up_date).filter((d): d is string => Boolean(d) && d! >= today).sort()[0];
      setFollowUp(due ?? '');
    });
  }, [today]);
  const next = (rows ?? []).find((a) => a.status === 'booked' && new Date(a.ends_at).getTime() > Date.now());

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>Hello, {profile?.full_name}</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-2xl">Next appointment</h2>
          {rows === null ? (
            <p role="status" className="mt-2 text-muted">Loading…</p>
          ) : next ? (
            <>
              <p className="mt-2 text-[1.05rem] font-bold text-ink">
                {formatDate(dayOf(next.starts_at, tz))}, {timeOf(next.starts_at, tz)}
              </p>
              <p className="text-muted">
                {next.service_name}, {next.doctor_name}
              </p>
              <Link to="/patient/appointments" className={`${btnOutline} mt-5`}>
                Change or cancel
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted">You have no upcoming appointments.</p>
              <Link to="/book" className={`${btnPrimary} mt-5`}>
                Book appointment
              </Link>
            </>
          )}
        </section>
        {followUp && (
          <section className={card}>
            <h2 className="font-display text-2xl">Follow-up due</h2>
            <p className="mt-2 text-[1.05rem] font-bold text-ink">{formatDate(followUp)}</p>
            <p className="text-muted">Your doctor asked to see you again around this date.</p>
            <Link to="/patient/visits" className={`${btnOutline} mt-5`}>
              See my visits
            </Link>
          </section>
        )}
        <section className={card}>
          <h2 className="font-display text-2xl">Your details</h2>
          <p className="mt-2 text-muted">Keep your date of birth, address and emergency contact up to date.</p>
          <Link to="/patient/profile" className={`${btnOutline} mt-5`}>
            Open my profile
          </Link>
        </section>
      </div>
      {next && (
        <Link to="/book" className={`${btnPrimary} mt-6`}>
          Book another appointment
        </Link>
      )}
      <p className="mt-6 text-[0.95rem] text-muted">
        Prescriptions, progress photos and receipts will appear here as the clinic
        switches them on.
      </p>
    </PortalShell>
  );
}
