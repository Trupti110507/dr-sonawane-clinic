import { useState } from 'react';
import { dayOf, timeOf } from '../lib/appointments';
import { friendlyError } from '../lib/auth';
import { formatDate, formatInr, telHref, type ClinicData } from '../lib/clinic';
import { supabase } from '../lib/supabase';
import { btnOutline, btnPrimary, card } from '../lib/ui';
import { Notice } from './Field';
import SlotPicker from './SlotPicker';
import { tr } from '../lib/i18n';

interface Props {
  clinic: ClinicData;
  /** Staff booking for someone else. Left out when a patient books for themselves. */
  forPatient?: { id: string; name: string };
  /** A doctor booking a follow-up into their own calendar */
  fixedDoctorId?: string;
  followUp?: boolean;
  /** Called after a successful booking */
  onBooked?: () => void;
  onClose?: () => void;
  doneLabel: string;
}

const choice = (active: boolean) =>
  `flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left ${
    active ? 'border-sage-600 bg-sage-50 ring-1 ring-sage-600' : 'border-line bg-white hover:bg-sage-50'
  }`;

/** Service -> doctor -> day and time -> confirm. The database has the final say on every step. */
export default function BookingFlow({ clinic, forPatient, fixedDoctorId, followUp, onBooked, onClose, doneLabel }: Props) {
  const { settings, services, doctors } = clinic;
  const [serviceId, setServiceId] = useState('');
  const [doctorId, setDoctorId] = useState(fixedDoctorId ?? (doctors.length === 1 ? doctors[0].id : ''));
  const [slot, setSlot] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const service = services.find((s) => s.id === serviceId);
  const doctor = doctors.find((d) => d.id === doctorId);

  async function confirm() {
    if (!supabase || !service || !doctorId || !slot) return;
    setBusy(true);
    setError('');
    const { error: failed } = await supabase.rpc('book_appointment', {
      p_doctor_id: doctorId,
      p_service_id: serviceId,
      p_starts_at: slot,
      p_patient_id: forPatient?.id ?? null,
      p_is_follow_up: Boolean(followUp),
    });
    setBusy(false);
    if (failed) {
      setError(friendlyError(failed));
      // Most likely someone else took the slot: show the fresh list.
      setSlot('');
      setRefreshKey((k) => k + 1);
      return;
    }
    setDone(true);
    onBooked?.();
  }

  if (done && service) {
    return (
      <div className={card} role="status">
        <h2 className="font-display text-2xl text-ink">{followUp ? 'Follow-up booked' : tr('Appointment booked', 'अपॉइंटमेंट बुक झाली')}</h2>
        <dl className="mt-4 space-y-2">
          <Row label={tr('When', 'वेळ')} value={`${formatDate(dayOf(slot, settings.timezone))}, ${timeOf(slot, settings.timezone)}`} />
          {forPatient && <Row label="Patient" value={forPatient.name} />}
          <Row label={tr('Doctor', 'डॉक्टर')} value={doctor?.full_name ?? tr('Your doctor', 'तुमचे डॉक्टर')} />
          <Row label={tr('Service', 'सेवा')} value={`${service.name}, ${tr(`about ${service.duration_minutes} minutes`, `सुमारे ${service.duration_minutes} मिनिटे`)}`} />
          <Row label={tr('Fee', 'शुल्क')} value={`${formatInr(service.price_inr)}, ${tr('paid at the clinic', 'क्लिनिकमध्ये भरायचे')}`} />
          <Row label={tr('Where', 'ठिकाण')} value={`${settings.address}, ${settings.city}`} />
        </dl>
        {!forPatient && (
          <p className="mt-4 text-muted">
            {tr('Please arrive 10 minutes early. To change this, open My appointments or call', "कृपया 10 मिनिटे आधी या. बदल करायचा असल्यास 'माझ्या अपॉइंटमेंट' उघडा किंवा फोन करा")}{' '}
            <a className="font-semibold text-sage-700 underline" href={telHref(settings.phone_primary)}>
              {settings.phone_primary}
            </a>
            .
          </p>
        )}
        <button className={`${btnPrimary} mt-6`} onClick={onClose}>
          {doneLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {forPatient && (
        <Notice kind="info">
          Booking for <strong>{forPatient.name}</strong>
          {followUp ? ' (follow-up visit)' : ''}.
        </Notice>
      )}

      <section aria-labelledby="step-service">
        <h2 id="step-service" className="font-display text-2xl text-ink">
          {tr('1. What is the visit for?', '1. भेट कशासाठी आहे?')}
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2" role="radiogroup" aria-labelledby="step-service">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === serviceId}
              className={choice(s.id === serviceId)}
              onClick={() => {
                setServiceId(s.id);
                setSlot('');
              }}
            >
              <span>
                <span className="block font-semibold text-ink">{s.name}</span>
                {s.description && <span className="block text-[0.95rem] text-muted">{s.description}</span>}
                <span className="block text-[0.95rem] text-muted">{tr(`About ${s.duration_minutes} minutes`, `सुमारे ${s.duration_minutes} मिनिटे`)}</span>
              </span>
              <span className="shrink-0 font-bold text-ink">{formatInr(s.price_inr)}</span>
            </button>
          ))}
        </div>
      </section>

      {!fixedDoctorId && (
        <section aria-labelledby="step-doctor">
          <h2 id="step-doctor" className="font-display text-2xl text-ink">
            {tr('2. Which doctor?', '2. कोणते डॉक्टर?')}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-labelledby="step-doctor">
            {doctors.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={d.id === doctorId}
                className={choice(d.id === doctorId)}
                onClick={() => {
                  setDoctorId(d.id);
                  setSlot('');
                }}
              >
                <span>
                  <span className="block font-semibold text-ink">{d.full_name}</span>
                  {d.qualification && <span className="block text-[0.95rem] text-muted">{d.qualification}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && doctorId && (
        <section aria-labelledby="step-time">
          <h2 id="step-time" className="font-display text-2xl text-ink">
            {fixedDoctorId ? '2' : '3'}. {tr('When?', 'कधी?')}
          </h2>
          <div className="mt-3">
            <SlotPicker clinic={clinic} doctorId={doctorId} serviceId={serviceId} value={slot} onChange={setSlot} refreshKey={refreshKey} />
          </div>
        </section>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {slot && service && (
        <section className={card} aria-labelledby="step-confirm">
          <h2 id="step-confirm" className="font-display text-2xl text-ink">
            {fixedDoctorId ? '3' : '4'}. {tr('Check and confirm', 'तपासा आणि निश्चित करा')}
          </h2>
          <dl className="mt-4 space-y-2">
            <Row label={tr('When', 'वेळ')} value={`${formatDate(dayOf(slot, settings.timezone))}, ${timeOf(slot, settings.timezone)}`} />
            <Row label={tr('Doctor', 'डॉक्टर')} value={doctor?.full_name ?? tr('Your doctor', 'तुमचे डॉक्टर')} />
            <Row label={tr('Service', 'सेवा')} value={service.name} />
            <Row label={tr('Fee', 'शुल्क')} value={`${formatInr(service.price_inr)}, ${tr('paid at the clinic', 'क्लिनिकमध्ये भरायचे')}`} />
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button className={btnPrimary} disabled={busy} onClick={() => void confirm()}>
              {busy ? tr('Booking…', 'बुक होत आहे…') : tr('Confirm appointment', 'अपॉइंटमेंट निश्चित करा')}
            </button>
            {onClose && (
              <button className={btnOutline} onClick={onClose}>
                {tr('Cancel', 'रद्द करा')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
