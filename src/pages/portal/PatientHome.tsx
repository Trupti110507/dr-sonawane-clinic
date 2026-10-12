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
import { tr } from '../../lib/i18n';

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
      <h1 className={pageTitle}>{tr('Hello', 'नमस्कार')}, {profile?.full_name}</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-2xl">{tr('Next appointment', 'पुढील अपॉइंटमेंट')}</h2>
          {rows === null ? (
            <p role="status" className="mt-2 text-muted">{tr('Loading…', 'लोड होत आहे…')}</p>
          ) : next ? (
            <>
              <p className="mt-2 text-[1.05rem] font-bold text-ink">
                {formatDate(dayOf(next.starts_at, tz))}, {timeOf(next.starts_at, tz)}
              </p>
              <p className="text-muted">
                {next.service_name}, {next.doctor_name}
              </p>
              <Link to="/patient/appointments" className={`${btnOutline} mt-5`}>
                {tr('Change or cancel', 'बदला किंवा रद्द करा')}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted">{tr('You have no upcoming appointments.', 'तुमची कोणतीही पुढील अपॉइंटमेंट नाही.')}</p>
              <Link to="/book" className={`${btnPrimary} mt-5`}>
                {tr('Book appointment', 'अपॉइंटमेंट बुक करा')}
              </Link>
            </>
          )}
        </section>
        {followUp && (
          <section className={card}>
            <h2 className="font-display text-2xl">{tr('Follow-up due', 'पुन्हा तपासणीची तारीख')}</h2>
            <p className="mt-2 text-[1.05rem] font-bold text-ink">{formatDate(followUp)}</p>
            <p className="text-muted">{tr('Your doctor asked to see you again around this date.', 'डॉक्टरांनी या तारखेच्या आसपास पुन्हा भेटायला सांगितले आहे.')}</p>
            <Link to="/patient/visits" className={`${btnOutline} mt-5`}>
              {tr('See my visits', 'माझ्या भेटी पहा')}
            </Link>
          </section>
        )}
        <section className={card}>
          <h2 className="font-display text-2xl">{tr('Prescriptions and treatment', 'प्रिस्क्रिप्शन आणि उपचार')}</h2>
          <p className="mt-2 text-muted">{tr('See the prescriptions your doctor has approved, and how far along your treatment plan is.', 'डॉक्टरांनी मंजूर केलेली प्रिस्क्रिप्शन आणि तुमच्या उपचार योजनेची प्रगती पहा.')}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link to="/patient/prescriptions" className={btnOutline}>
              {tr('Prescriptions', 'प्रिस्क्रिप्शन')}
            </Link>
            <Link to="/patient/treatment" className={btnOutline}>
              {tr('Treatment plans', 'उपचार योजना')}
            </Link>
          </div>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">{tr('Progress photos', 'प्रगतीचे फोटो')}</h2>
          <p className="mt-2 text-muted">{tr('Give or withdraw your consent to clinical photographs, and see the photos your doctor has shared.', 'उपचाराच्या फोटोंसाठी संमती द्या किंवा मागे घ्या, आणि डॉक्टरांनी शेअर केलेले फोटो पहा.')}</p>
          <Link to="/patient/photos" className={`${btnOutline} mt-5`}>
            {tr('Open photos', 'फोटो उघडा')}
          </Link>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">{tr('Payments', 'पेमेंट')}</h2>
          <p className="mt-2 text-muted">{tr('See what is still to pay and print your receipts.', 'किती भरायचे बाकी आहे ते पहा आणि पावत्या प्रिंट करा.')}</p>
          <Link to="/patient/payments" className={`${btnOutline} mt-5`}>
            {tr('Open payments', 'पेमेंट उघडा')}
          </Link>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">{tr('Your details', 'तुमची माहिती')}</h2>
          <p className="mt-2 text-muted">{tr('Keep your date of birth, address and emergency contact up to date.', 'जन्मतारीख, पत्ता आणि आपत्कालीन संपर्क अद्ययावत ठेवा.')}</p>
          <Link to="/patient/profile" className={`${btnOutline} mt-5`}>
            {tr('Open my profile', 'माझी माहिती उघडा')}
          </Link>
        </section>
      </div>
      {next && (
        <Link to="/book" className={`${btnPrimary} mt-6`}>
          {tr('Book another appointment', 'आणखी एक अपॉइंटमेंट बुक करा')}
        </Link>
      )}
    </PortalShell>
  );
}
