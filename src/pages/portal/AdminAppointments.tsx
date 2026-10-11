import { useEffect, useId, useState } from 'react';
import AppointmentItem from '../../components/AppointmentItem';
import BookingFlow from '../../components/BookingFlow';
import { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { addDays, showPhone, type Appointment } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { useAppointments } from '../../lib/useAppointments';
import { btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface PatientOption {
  user_id: string;
  full_name: string;
  phone: string | null;
}

export default function AdminAppointments({ clinic }: { clinic: ClinicData }) {
  const today = clinicDate(clinic.settings.timezone);
  const dateId = useId();
  const doctorId = useId();
  const [date, setDate] = useState(today);
  const [doctor, setDoctor] = useState('');
  const { rows, error, reload } = useAppointments(date, date, doctor || undefined);
  // 'list' = the day view; 'pick' = choosing a patient; a patient object = booking for them
  const [booking, setBooking] = useState<'list' | 'pick' | { id: string; name: string; followUp?: boolean; doctorId?: string }>('list');

  const count = (s: string) => (rows ?? []).filter((a) => a.status === s).length;

  if (booking === 'pick') {
    return (
      <PortalShell label="Admin portal" links={ADMIN_LINKS}>
        <h1 className={pageTitle}>Book for a patient</h1>
        <PatientPicker onPick={(p) => setBooking({ id: p.user_id, name: p.full_name })} onClose={() => setBooking('list')} />
      </PortalShell>
    );
  }
  if (booking !== 'list') {
    return (
      <PortalShell label="Admin portal" links={ADMIN_LINKS}>
        <h1 className={pageTitle}>Book for a patient</h1>
        <div className="mt-6 max-w-4xl">
          <BookingFlow
            clinic={clinic}
            forPatient={booking}
            followUp={booking.followUp}
            doneLabel="Back to appointments"
            onBooked={() => void reload()}
            onClose={() => setBooking('list')}
          />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={pageTitle}>Appointments</h1>
        <button className={btnPrimary} onClick={() => setBooking('pick')}>
          Book for a patient
        </button>
      </div>

      <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={dateId} className="block font-semibold text-ink">
            Day
          </label>
          <input id={dateId} type="date" className={inputBox} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor={doctorId} className="block font-semibold text-ink">
            Doctor
          </label>
          <select id={doctorId} className={inputBox} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">All doctors</option>
            {clinic.doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btnSmall} onClick={() => setDate(addDays(date, -1))}>
          Previous day
        </button>
        <button className={btnSmall} onClick={() => setDate(today)}>
          Today
        </button>
        <button className={btnSmall} onClick={() => setDate(addDays(date, 1))}>
          Next day
        </button>
      </div>

      <h2 className="mt-8 font-display text-2xl" aria-live="polite">
        {formatDate(date)}
      </h2>
      {error && (
        <div className="mt-4 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-3 text-muted">Loading appointments…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-muted">No appointments on this day.</p>
      ) : (
        <>
          <p className="mt-1 text-[0.95rem] text-muted">
            {count('booked')} booked, {count('completed')} completed, {count('cancelled')} cancelled, {count('no_show')} did not attend
          </p>
          <ul className="mt-2 max-w-3xl divide-y divide-line border-y border-line">
            {rows.map((a) => (
              <AppointmentItem
                key={a.id}
                appointment={a}
                clinic={clinic}
                viewer="admin"
                onChanged={() => void reload()}
                onFollowUp={(x: Appointment) => setBooking({ id: x.patient_id, name: x.patient_name, followUp: true })}
              />
            ))}
          </ul>
        </>
      )}
    </PortalShell>
  );
}

/** Find a registered patient by name or mobile number. */
function PatientPicker({ onPick, onClose }: { onPick: (p: PatientOption) => void; onClose: () => void }) {
  const searchId = useId();
  const [all, setAll] = useState<PatientOption[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      ?.from('profiles')
      .select('user_id, full_name, phone')
      .eq('role', 'patient')
      .eq('is_active', true)
      .neq('full_name', '')
      .order('full_name')
      .then(({ data, error: failed }) => {
        if (failed) setError(friendlyError(failed));
        setAll((data as PatientOption[]) ?? []);
      });
  }, []);

  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const shown = (all ?? []).filter((p) => !q || p.full_name.toLowerCase().includes(q) || (digits !== '' && (p.phone ?? '').includes(digits))).slice(0, 20);

  return (
    <div className={`${card} mt-6 max-w-3xl`}>
      <label htmlFor={searchId} className="block font-semibold text-ink">
        Search by name or mobile number
      </label>
      <input id={searchId} type="search" autoFocus className={inputBox} value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {all === null ? (
        <p role="status" className="mt-4 text-muted">Loading patients…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-muted">
          No registered patient matches. A new patient first signs in once with their mobile number;
          after that they appear here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {shown.map((p) => (
            <li key={p.user_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{p.full_name}</p>
                <p className="text-[0.95rem] text-muted">{showPhone(p.phone)}</p>
              </div>
              <button className={btnSmall} aria-label={`Book for ${p.full_name}`} onClick={() => onPick(p)}>
                Book
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className={`${btnOutline} mt-5`} onClick={onClose}>
        Back to appointments
      </button>
    </div>
  );
}
