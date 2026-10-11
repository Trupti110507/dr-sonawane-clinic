import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DoctorPlans from '../../components/DoctorPlans';
import DoctorPrescriptions from '../../components/DoctorPrescriptions';
import Field, { Notice } from '../../components/Field';
import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import { addDays, dayOf, showPhone, timeOf } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { GENDER_LABEL, ageFrom, type ClinicalProfile, type PatientRecord, type Visit } from '../../lib/records';
import { supabase } from '../../lib/supabase';
import { btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle, textLink } from '../../lib/ui';

const NOTE_FIELDS: { key: 'complaints' | 'examination_notes' | 'diagnosis' | 'plan'; label: string; hint: string; rows: number }[] = [
  { key: 'complaints', label: 'Complaints', hint: 'What the patient reports, in their words, and for how long', rows: 3 },
  { key: 'examination_notes', label: 'Examination', hint: 'What you found on examination', rows: 3 },
  { key: 'diagnosis', label: 'Diagnosis', hint: 'Your clinical diagnosis', rows: 2 },
  { key: 'plan', label: 'Plan', hint: 'Treatment plan and advice given', rows: 3 },
];

type NoteForm = { complaints: string; examination_notes: string; diagnosis: string; plan: string; follow_up_date: string };
const EMPTY_NOTE: NoteForm = { complaints: '', examination_notes: '', diagnosis: '', plan: '', follow_up_date: '' };

export default function DoctorPatientRecord({ clinic }: { clinic: ClinicData }) {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const appointmentId = params.get('appointment');
  const tz = clinic.settings.timezone;
  const today = clinicDate(tz);

  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [error, setError] = useState('');
  // Which note form is open: null = none, 'new' = a new consultation, otherwise the id of the note being edited
  const [editing, setEditing] = useState<string | null>(appointmentId ? 'new' : null);
  const [message, setMessage] = useState('');

  // Opening this page is itself recorded in the clinic's access log.
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: failed } = await supabase.rpc('get_patient_record', { p_patient_id: id });
    if (failed) setError(friendlyError(failed));
    else setRecord(data as PatientRecord);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
        <h1 className={pageTitle}>Patient record</h1>
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
        <Link to="/doctor/patients" className={`${btnOutline} mt-6`}>
          Back to my patients
        </Link>
      </PortalShell>
    );
  }
  if (!record) {
    return (
      <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
        <p role="status" className="text-muted">Opening the record…</p>
      </PortalShell>
    );
  }

  const { patient, profile, visits } = record;
  const age = ageFrom(patient.date_of_birth, today);
  const linkedVisit = appointmentId ? visits.find((v) => v.appointment_id === appointmentId) : undefined;
  const nextFollowUp = visits.map((v) => v.follow_up_date).filter((d): d is string => Boolean(d) && d! >= today).sort()[0];

  function closeForm(saved?: string) {
    setEditing(null);
    if (appointmentId) setParams({}, { replace: true });
    if (saved) {
      setMessage(saved);
      void load();
    }
  }

  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <p>
        <Link to="/doctor/patients" className={textLink}>
          My patients
        </Link>
      </p>
      <h1 className={`${pageTitle} mt-2`}>{patient.full_name || 'Name not given'}</h1>
      <p className="mt-2 text-muted">
        {[age !== null ? `${age} years` : null, patient.gender ? GENDER_LABEL[patient.gender] : null, showPhone(patient.phone)].filter(Boolean).join(', ')}
      </p>
      {patient.emergency_contact_name && (
        <p className="text-[0.95rem] text-muted">
          Emergency contact: {patient.emergency_contact_name}
          {patient.emergency_contact_phone ? `, +91 ${patient.emergency_contact_phone}` : ''}
        </p>
      )}
      {nextFollowUp && (
        <p className="mt-3 inline-block rounded-full bg-lavender-200 px-3 py-1 font-semibold text-lavender-700">
          Follow-up due {formatDate(nextFollowUp)}
        </p>
      )}

      {message && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="success">{message}</Notice>
        </div>
      )}

      <ProfileCard patientId={patient.id} profile={profile} onSaved={() => { setMessage('Medical summary saved.'); void load(); }} />

      <section className="mt-10 max-w-3xl" aria-labelledby="visits-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="visits-title" className="font-display text-2xl">
            Consultations
          </h2>
          {editing === null && (
            <button className={btnPrimary} onClick={() => { setMessage(''); setEditing('new'); }}>
              New consultation
            </button>
          )}
        </div>

        {editing === 'new' &&
          (linkedVisit ? (
            <div className="mt-4">
              <Notice kind="info">This appointment already has a note, dated {formatDate(linkedVisit.visit_date)}. Edit that note below.</Notice>
            </div>
          ) : (
            <NoteEditor
              title={`New consultation, ${formatDate(today)}`}
              patientId={patient.id}
              appointmentId={appointmentId}
              initial={EMPTY_NOTE}
              minFollowUp={today}
              onClose={closeForm}
            />
          ))}

        {visits.length === 0 ? (
          editing === null && <p className="mt-4 text-muted">No consultation notes yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {visits.map((v) =>
              editing === v.id ? (
                <li key={v.id}>
                  <NoteEditor
                    title={`Edit note of ${formatDate(v.visit_date)}`}
                    patientId={patient.id}
                    visitId={v.id}
                    initial={{
                      complaints: v.complaints ?? '',
                      examination_notes: v.examination_notes ?? '',
                      diagnosis: v.diagnosis ?? '',
                      plan: v.plan ?? '',
                      follow_up_date: v.follow_up_date ?? '',
                    }}
                    minFollowUp={v.visit_date}
                    onClose={closeForm}
                  />
                </li>
              ) : (
                <VisitCard key={v.id} visit={v} mine={v.doctor_id === record.my_doctor_id} timezone={tz} canEdit={editing === null} onEdit={() => { setMessage(''); setEditing(v.id); }} />
              ),
            )}
          </ul>
        )}
      </section>

      <DoctorPrescriptions
        patientId={patient.id}
        patientName={patient.full_name}
        allergies={profile?.allergies ?? null}
        prescriptions={record.prescriptions ?? []}
        myDoctorId={record.my_doctor_id}
        settings={clinic.settings}
        onChanged={() => { setMessage(''); void load(); }}
      />
      <DoctorPlans
        patientId={patient.id}
        plans={record.treatment_plans ?? []}
        myDoctorId={record.my_doctor_id}
        onChanged={() => { setMessage(''); void load(); }}
      />
    </PortalShell>
  );
}

/** Allergies, long-term conditions and current medicines: the things to see before prescribing. */
function ProfileCard({ patientId, profile, onSaved }: { patientId: string; profile: ClinicalProfile | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ allergies: '', conditions: '', current_medications: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  function start() {
    setForm({
      allergies: profile?.allergies ?? '',
      conditions: profile?.conditions ?? '',
      current_medications: profile?.current_medications ?? '',
      notes: profile?.notes ?? '',
    });
    setError('');
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('save_clinical_profile', {
      p_patient_id: patientId,
      p_allergies: form.allergies,
      p_conditions: form.conditions,
      p_current_medications: form.current_medications,
      p_notes: form.notes,
    });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    setOpen(false);
    onSaved();
  }

  const lines: [string, string | null | undefined][] = [
    ['Allergies', profile?.allergies],
    ['Long-term conditions', profile?.conditions],
    ['Current medicines', profile?.current_medications],
    ['Other notes', profile?.notes],
  ];

  return (
    <section className={`${card} mt-6 max-w-3xl`} aria-labelledby="summary-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="summary-title" className="font-display text-2xl">
          Medical summary
        </h2>
        {!open && (
          <button className={btnSmall} onClick={start}>
            {profile ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      {open ? (
        <form onSubmit={save} noValidate className="mt-4 space-y-5">
          <Field label="Allergies" hint="Medicines, foods or materials. Write None known if asked and none." value={form.allergies} maxLength={1000} onChange={set('allergies')} />
          <Field label="Long-term conditions" value={form.conditions} maxLength={1000} onChange={set('conditions')} />
          <Field label="Current medicines" value={form.current_medications} maxLength={1000} onChange={set('current_medications')} />
          <Field label="Other notes" value={form.notes} maxLength={2000} onChange={set('notes')} />
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Saving…' : 'Save summary'}
            </button>
            <button type="button" className={btnOutline} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-3 space-y-2">
          {lines.map(([label, value]) => (
            <div key={label} className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="w-48 shrink-0 text-muted">{label}</dt>
              <dd className={value ? 'whitespace-pre-wrap font-semibold text-ink' : 'text-muted'}>{value || 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function VisitCard({ visit: v, mine, timezone, canEdit, onEdit }: { visit: Visit; mine: boolean; timezone: string; canEdit: boolean; onEdit: () => void }) {
  const [history, setHistory] = useState<{ revised_at: string; previous: Record<string, string | null> }[] | null>(null);
  const [error, setError] = useState('');

  async function showHistory() {
    if (history) return setHistory(null);
    const { data, error: failed } = await supabase!.rpc('visit_history', { p_visit_id: v.id });
    if (failed) setError(friendlyError(failed));
    else setHistory(data ?? []);
  }

  return (
    <li className={card}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[1.05rem] font-bold text-ink">{formatDate(v.visit_date)}</h3>
          <p className="text-[0.95rem] text-muted">{v.doctor_name}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {v.edits > 0 && (
            <button className={btnSmall} aria-expanded={history !== null} onClick={() => void showHistory()}>
              {history ? 'Hide earlier wording' : `Edited ${v.edits === 1 ? 'once' : `${v.edits} times`}`}
            </button>
          )}
          {mine && canEdit && (
            <button className={btnSmall} onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
      <dl className="mt-3 space-y-3">
        {NOTE_FIELDS.filter((f) => v[f.key]).map((f) => (
          <div key={f.key}>
            <dt className="text-[0.95rem] text-muted">{f.label}</dt>
            <dd className="whitespace-pre-wrap text-ink">{v[f.key]}</dd>
          </div>
        ))}
        {v.follow_up_date && (
          <div>
            <dt className="text-[0.95rem] text-muted">Follow-up</dt>
            <dd className="font-semibold text-ink">{formatDate(v.follow_up_date)}</dd>
          </div>
        )}
      </dl>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {history && (
        <div className="mt-4 rounded-2xl border border-line bg-sage-50 p-4">
          <p className="font-semibold text-ink">Earlier wording</p>
          {history.map((h) => (
            <div key={h.revised_at} className="mt-3 border-t border-line pt-3 first:mt-2 first:border-t-0 first:pt-0">
              <p className="text-[0.95rem] text-muted">
                Before the edit on {formatDate(dayOf(h.revised_at, timezone))}, {timeOf(h.revised_at, timezone)}
              </p>
              {NOTE_FIELDS.filter((f) => h.previous[f.key]).map((f) => (
                <p key={f.key} className="mt-1 whitespace-pre-wrap text-ink">
                  <span className="text-muted">{f.label}: </span>
                  {h.previous[f.key]}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

interface EditorProps {
  title: string;
  patientId: string;
  visitId?: string;
  appointmentId?: string | null;
  initial: NoteForm;
  minFollowUp: string;
  /** Called with a success message after saving, or with nothing on cancel */
  onClose: (saved?: string) => void;
}

/** The consultation form. The doctor types every word; nothing is suggested or filled in. */
function NoteEditor({ title, patientId, visitId, appointmentId, initial, minFollowUp, onClose }: EditorProps) {
  const followId = useId();
  const [form, setForm] = useState<NoteForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  // Warn before a refresh or tab close would throw away typed notes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!NOTE_FIELDS.some((f) => form[f.key].trim())) {
      return setError('Write at least one of complaints, examination, diagnosis or plan.');
    }
    if (form.follow_up_date && form.follow_up_date < minFollowUp) {
      return setError('The follow-up date must be on or after the visit.');
    }
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('save_visit', {
      p_patient_id: patientId,
      p_complaints: form.complaints,
      p_examination_notes: form.examination_notes,
      p_diagnosis: form.diagnosis,
      p_plan: form.plan,
      p_follow_up_date: form.follow_up_date || null,
      p_appointment_id: visitId ? null : (appointmentId ?? null),
      p_visit_id: visitId ?? null,
    });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    onClose(visitId ? 'Note updated. The earlier wording has been kept.' : 'Consultation saved.');
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-4 space-y-5 border-sage-300`}>
      <h3 className="font-display text-2xl">{title}</h3>
      {NOTE_FIELDS.map((f) => (
        <NoteArea key={f.key} label={f.label} hint={f.hint} rows={f.rows} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />
      ))}
      <div className="max-w-xs">
        <label htmlFor={followId} className="block font-semibold text-ink">
          Follow-up date
        </label>
        <p className="text-[0.95rem] text-muted">Optional. The patient sees this date.</p>
        <input id={followId} type="date" className={inputBox} min={minFollowUp} max={addDays(minFollowUp, 730)} value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : visitId ? 'Save changes' : 'Save consultation'}
        </button>
        <button type="button" className={btnOutline} onClick={() => onClose()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NoteArea({ label, hint, rows, value, onChange }: { label: string; hint: string; rows: number; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-[0.95rem] text-muted">
        {hint}
      </p>
      <textarea id={id} aria-describedby={`${id}-hint`} rows={rows} maxLength={4000} className={`${inputBox} py-3`} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
