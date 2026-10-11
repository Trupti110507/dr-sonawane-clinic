import { useEffect, useState } from 'react';
import AppointmentItem from '../../components/AppointmentItem';
import BookingFlow from '../../components/BookingFlow';
import { Notice } from '../../components/Field';
import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import type { Appointment } from '../../lib/appointments';
import { useAuth } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { useAppointments } from '../../lib/useAppointments';
import { pageTitle } from '../../lib/ui';

export default function DoctorHome({ clinic }: { clinic: ClinicData }) {
  const { profile } = useAuth();
  const today = clinicDate(clinic.settings.timezone);
  const { rows, error, reload } = useAppointments(today, today);
  const [followUp, setFollowUp] = useState<Appointment | null>(null);
  // Is this login linked to a doctor listing? (undefined = still checking)
  const [linked, setLinked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase?.rpc('my_doctor_id').then(({ data }) => setLinked(Boolean(data)));
  }, []);

  const live = (rows ?? []).filter((a) => a.status !== 'cancelled');
  const cancelled = (rows ?? []).filter((a) => a.status === 'cancelled');

  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <h1 className={pageTitle}>Today</h1>
      <p className="mt-2 text-muted">
        {profile?.full_name}, {formatDate(today)}
      </p>

      {linked === false && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="info">
            Your login is not linked to a doctor listing yet, so no appointments can be shown. Ask
            the clinic administrator to link it in Staff accounts.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {followUp ? (
        <div className="mt-6 max-w-4xl">
          <BookingFlow
            clinic={clinic}
            forPatient={{ id: followUp.patient_id, name: followUp.patient_name }}
            fixedDoctorId={followUp.doctor_id}
            followUp
            doneLabel="Back to today"
            onClose={() => setFollowUp(null)}
          />
        </div>
      ) : rows === null ? (
        <p role="status" className="mt-6 text-muted">Loading today&rsquo;s appointments…</p>
      ) : live.length === 0 ? (
        <p className="mt-6 text-muted">No appointments today.</p>
      ) : (
        <>
          <p className="mt-6 text-[0.95rem] text-muted">
            {live.length} {live.length === 1 ? 'appointment' : 'appointments'}
          </p>
          <ul className="mt-2 max-w-3xl divide-y divide-line border-y border-line">
            {live.map((a) => (
              <AppointmentItem key={a.id} appointment={a} clinic={clinic} viewer="doctor" onChanged={() => void reload()} onFollowUp={setFollowUp} />
            ))}
          </ul>
        </>
      )}

      {!followUp && cancelled.length > 0 && (
        <section className="mt-8 max-w-3xl" aria-labelledby="cancelled-title">
          <h2 id="cancelled-title" className="font-display text-2xl">
            Cancelled today
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {cancelled.map((a) => (
              <AppointmentItem key={a.id} appointment={a} clinic={clinic} viewer="doctor" onChanged={() => void reload()} />
            ))}
          </ul>
        </section>
      )}
    </PortalShell>
  );
}
