import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, STATUS_LOOK, dayOf, showPhone, timeOf, type Appointment } from '../lib/appointments';
import { friendlyError, type Role } from '../lib/auth';
import { formatDate, type ClinicData } from '../lib/clinic';
import { supabase } from '../lib/supabase';
import { btnDanger, btnOutline, btnPrimary, btnSmall, inputBox } from '../lib/ui';
import { Notice } from './Field';
import SlotPicker from './SlotPicker';
import { tr } from '../lib/i18n';

interface Props {
  appointment: Appointment;
  clinic: ClinicData;
  /** Who is looking: decides which details and buttons appear */
  viewer: Role;
  /** Show the date line (lists that span several days) */
  showDate?: boolean;
  onChanged: () => void;
  /** Staff only: start a follow-up booking for this patient */
  onFollowUp?: (a: Appointment) => void;
}

type Mode = 'idle' | 'cancel' | 'move';

/** One appointment with the actions the viewer is allowed to take. */
export default function AppointmentItem({ appointment: a, clinic, viewer, showDate, onChanged, onFollowUp }: Props) {
  const tz = clinic.settings.timezone;
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [newSlot, setNewSlot] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upcoming = new Date(a.starts_at).getTime() > Date.now();
  const staff = viewer !== 'patient';
  const canChange = a.status === 'booked' && (staff || upcoming);
  const canClose = staff && a.status === 'booked' && dayOf(a.starts_at, tz) <= dayOf(new Date().toISOString(), tz);

  async function run(fn: string, args: Record<string, unknown>, onFail?: () => void) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: failed } = await supabase.rpc(fn, args);
    setBusy(false);
    if (failed) {
      setError(friendlyError(failed));
      onFail?.();
      return;
    }
    setMode('idle');
    onChanged();
  }

  return (
    <li className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[1.05rem] font-bold text-ink">
            {timeOf(a.starts_at, tz)} {tr('to', 'ते')} {timeOf(a.ends_at, tz)}
            <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-sm font-semibold ${STATUS_LOOK[a.status]}`}>
              {STATUS_LABEL[a.status]}
            </span>
          </p>
          {showDate && <p className="text-ink">{formatDate(dayOf(a.starts_at, tz))}</p>}
          {staff && (
            <p className="text-ink">
              {a.patient_name || 'Name not given'}
              {a.patient_phone && (
                <>
                  {', '}
                  <a className="font-semibold text-sage-700 underline" href={`tel:+${a.patient_phone}`}>
                    {showPhone(a.patient_phone)}
                  </a>
                </>
              )}
            </p>
          )}
          <p className="text-[0.95rem] text-muted">
            {a.service_name}
            {a.is_follow_up ? tr(' (follow-up)', ' (पुन्हा तपासणी)') : ''}
            {viewer !== 'doctor' ? `, ${a.doctor_name}` : ''}
          </p>
          {a.status === 'cancelled' && a.cancel_reason && <p className="text-[0.95rem] text-muted">{tr('Reason', 'कारण')}: {a.cancel_reason}</p>}
        </div>

        {mode === 'idle' && (canChange || canClose || viewer === 'doctor' || (onFollowUp && a.status === 'completed')) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {viewer === 'doctor' && (
              <Link className={btnSmall} to={`/doctor/patients/${a.patient_id}${a.status === 'booked' || a.status === 'completed' ? `?appointment=${a.id}` : ''}`}>
                {a.status === 'booked' ? 'Start consultation' : 'Open record'}
              </Link>
            )}
            {canClose && (
              <>
                <button className={btnSmall} disabled={busy} onClick={() => void run('set_appointment_outcome', { p_id: a.id, p_status: 'completed' })}>
                  Attended
                </button>
                <button className={btnSmall} disabled={busy} onClick={() => void run('set_appointment_outcome', { p_id: a.id, p_status: 'no_show' })}>
                  Did not attend
                </button>
              </>
            )}
            {onFollowUp && a.status === 'completed' && (
              <button className={btnSmall} onClick={() => onFollowUp(a)}>
                Book follow-up
              </button>
            )}
            {canChange && (
              <>
                <button className={btnSmall} onClick={() => { setError(''); setNewSlot(''); setMode('move'); }}>
                  {tr('Reschedule', 'वेळ बदला')}
                </button>
                <button className={btnSmall} onClick={() => { setError(''); setMode('cancel'); }}>
                  {tr('Cancel', 'रद्द करा')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="mt-3 rounded-2xl border border-line bg-sage-50 p-4">
          <label className="block font-semibold text-ink">
            {tr('Reason for cancelling', 'रद्द करण्याचे कारण')} <span className="font-normal text-muted">{tr('(optional)', '(ऐच्छिक)')}</span>
            <input className={inputBox} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btnDanger} disabled={busy} onClick={() => void run('cancel_appointment', { p_id: a.id, p_reason: reason })}>
              {busy ? tr('Cancelling…', 'रद्द होत आहे…') : tr('Yes, cancel appointment', 'होय, अपॉइंटमेंट रद्द करा')}
            </button>
            <button className={btnSmall} onClick={() => setMode('idle')}>
              {tr('Keep appointment', 'अपॉइंटमेंट ठेवा')}
            </button>
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div className="mt-3 rounded-2xl border border-line bg-sage-50 p-4">
          <p className="mb-3 text-muted">{tr(`Choose a new day and time with ${a.doctor_name}.`, `${a.doctor_name} यांच्यासोबत नवीन दिवस आणि वेळ निवडा.`)}</p>
          <SlotPicker clinic={clinic} doctorId={a.doctor_id} serviceId={a.service_id} excludeId={a.id} value={newSlot} onChange={setNewSlot} refreshKey={refreshKey} />
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              className={btnPrimary}
              disabled={busy || !newSlot}
              onClick={() =>
                void run('reschedule_appointment', { p_id: a.id, p_new_starts_at: newSlot }, () => {
                  setNewSlot('');
                  setRefreshKey((k) => k + 1);
                })
              }
            >
              {busy ? tr('Moving…', 'बदलत आहे…') : newSlot ? tr(`Move to ${timeOf(newSlot, tz)}`, `${timeOf(newSlot, tz)} ला बदला`) : tr('Choose a time', 'वेळ निवडा')}
            </button>
            <button className={btnOutline} onClick={() => setMode('idle')}>
              {tr('Keep current time', 'सध्याची वेळ ठेवा')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
