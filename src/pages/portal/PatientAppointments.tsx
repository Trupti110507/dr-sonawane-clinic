import { Link } from 'react-router-dom';
import AppointmentItem from '../../components/AppointmentItem';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { addDays } from '../../lib/appointments';
import { clinicDate, type ClinicData } from '../../lib/clinic';
import { useAppointments } from '../../lib/useAppointments';
import { btnPrimary, pageTitle } from '../../lib/ui';
import { tr } from '../../lib/i18n';

export default function PatientAppointments({ clinic }: { clinic: ClinicData }) {
  const today = clinicDate(clinic.settings.timezone);
  // Two years back, and as far ahead as booking allows.
  const { rows, error, reload } = useAppointments(addDays(today, -730), addDays(today, (clinic.settings.booking_window_days ?? 30) + 1));
  const now = Date.now();
  const upcoming = (rows ?? []).filter((a) => a.status === 'booked' && new Date(a.ends_at).getTime() > now);
  const past = (rows ?? []).filter((a) => !upcoming.includes(a)).reverse();

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={pageTitle}>{tr('My appointments', 'माझ्या अपॉइंटमेंट')}</h1>
        <Link to="/book" className={btnPrimary}>
          {tr('Book appointment', 'अपॉइंटमेंट बुक करा')}
        </Link>
      </div>
      {error && (
        <div className="mt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your appointments…', 'तुमच्या अपॉइंटमेंट लोड होत आहेत…')}</p>
      ) : (
        <>
          <section className="mt-8 max-w-3xl" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="font-display text-2xl">
              {tr('Upcoming', 'पुढील')}
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-muted">{tr('You have no upcoming appointments.', 'तुमची कोणतीही पुढील अपॉइंटमेंट नाही.')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {upcoming.map((a) => (
                  <AppointmentItem key={a.id} appointment={a} clinic={clinic} viewer="patient" showDate onChanged={() => void reload()} />
                ))}
              </ul>
            )}
          </section>
          {past.length > 0 && (
            <section className="mt-10 max-w-3xl" aria-labelledby="past-title">
              <h2 id="past-title" className="font-display text-2xl">
                {tr('Earlier', 'आधीच्या')}
              </h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {past.map((a) => (
                  <AppointmentItem key={a.id} appointment={a} clinic={clinic} viewer="patient" showDate onChanged={() => void reload()} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PortalShell>
  );
}
