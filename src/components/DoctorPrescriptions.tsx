import { useEffect, useId, useState, type FormEvent } from 'react';
import { dayOf } from '../lib/appointments';
import { friendlyError } from '../lib/auth';
import { formatDate, type ClinicSettings } from '../lib/clinic';
import type { Prescription, PrescriptionItem } from '../lib/records';
import { supabase } from '../lib/supabase';
import { btnDanger, btnOutline, btnPrimary, btnSmall, card, inputBox } from '../lib/ui';
import Field, { Notice } from './Field';
import PrescriptionSheet from './PrescriptionSheet';

type Line = { medicine_name: string; dosage: string; frequency: string; duration: string; instructions: string };
const EMPTY_LINE: Line = { medicine_name: '', dosage: '', frequency: '', duration: '', instructions: '' };
const toLine = (i: PrescriptionItem): Line => ({
  medicine_name: i.medicine_name,
  dosage: i.dosage ?? '',
  frequency: i.frequency ?? '',
  duration: i.duration ?? '',
  instructions: i.instructions ?? '',
});

interface Props {
  patientId: string;
  patientName: string;
  /** Allergies from the medical summary, shown beside the form as a reminder */
  allergies: string | null;
  prescriptions: Prescription[];
  myDoctorId: string;
  settings: ClinicSettings;
  /** Reload the record */
  onChanged: () => Promise<void> | void;
}

/** Prescriptions inside the patient record: write a draft, check it, approve it, or withdraw it. */
export default function DoctorPrescriptions({ patientId, patientName, allergies, prescriptions, myDoctorId, settings, onChanged }: Props) {
  // null = no form open, 'new' = a new prescription, otherwise the id of the draft being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shown inside this section, next to what was just done
  const [notice, setNotice] = useState('');
  // The message appears only once the list on screen is up to date.
  const changed = async (text: string) => {
    await onChanged();
    setNotice(text);
  };

  async function run(fn: string, args: Record<string, unknown>, done: string) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { error: failed } = await supabase.rpc(fn, args);
    if (failed) {
      setBusy(false);
      return setError(friendlyError(failed));
    }
    await changed(done);
    setConfirming(null);
    setWithdrawing(null);
    setReason('');
    setBusy(false);
  }

  return (
    <section className="mt-10 max-w-3xl" aria-labelledby="rx-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="rx-title" className="font-display text-2xl">
          Prescriptions
        </h2>
        {editing === null && (
          <button className={btnPrimary} onClick={() => { setError(''); setNotice(''); setEditing('new'); }}>
            New prescription
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && !error && (
        <div className="mt-4">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}

      {editing === 'new' && (
        <PrescriptionEditor
          patientId={patientId}
          allergies={allergies}
          initialLines={[{ ...EMPTY_LINE }]}
          initialNotes=""
          onClose={(saved) => { setEditing(null); if (saved) void changed(saved); }}
        />
      )}

      {prescriptions.length === 0 ? (
        editing === null && <p className="mt-4 text-muted">No prescriptions yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {prescriptions.map((rx) => {
            const mine = rx.doctor_id === myDoctorId;
            if (editing === rx.id) {
              return (
                <li key={rx.id}>
                  <PrescriptionEditor
                    patientId={patientId}
                    prescriptionId={rx.id}
                    allergies={allergies}
                    initialLines={rx.items.length ? rx.items.map(toLine) : [{ ...EMPTY_LINE }]}
                    initialNotes={rx.general_instructions ?? ''}
                    onClose={(saved) => { setEditing(null); if (saved) void changed(saved); }}
                  />
                </li>
              );
            }
            if (rx.status === 'approved') {
              return (
                <li key={rx.id}>
                  <PrescriptionSheet
                    rx={rx}
                    settings={settings}
                    patientName={patientName}
                    actions={
                      mine && withdrawing !== rx.id ? (
                        <button className={btnSmall} onClick={() => { setError(''); setReason(''); setWithdrawing(rx.id); }}>
                          Withdraw
                        </button>
                      ) : undefined
                    }
                  />
                  {withdrawing === rx.id && (
                    <form
                      noValidate
                      className={`${card} mt-2 space-y-4 border-[#e3b9b6]`}
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        if (!reason.trim()) return setError('Say why the prescription is withdrawn.');
                        void run('withdraw_prescription', { p_id: rx.id, p_reason: reason }, 'Prescription withdrawn. The patient no longer sees it.');
                      }}
                    >
                      <p className="text-ink">
                        Withdrawing removes this prescription from the patient's portal. It stays in the record, marked withdrawn. Write a new prescription to replace it.
                      </p>
                      <Field label="Reason for withdrawing" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button type="submit" disabled={busy} className={btnDanger}>
                          {busy ? 'Withdrawing…' : 'Withdraw prescription'}
                        </button>
                        <button type="button" className={btnSmall} onClick={() => setWithdrawing(null)}>
                          Keep it
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            }
            return (
              <li key={rx.id} className={`${card} ${rx.status === 'draft' ? 'border-lavender-400' : 'bg-sage-50'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-[1.05rem] font-bold text-ink">
                      {rx.status === 'draft' ? 'Draft' : 'Withdrawn'}, {formatDate(dayOf(rx.created_at, settings.timezone))}
                    </h3>
                    <p className="text-[0.95rem] text-muted">{rx.doctor_name}</p>
                  </div>
                  <span className={`self-start rounded-full px-3 py-1 text-[0.95rem] font-semibold ${rx.status === 'draft' ? 'bg-lavender-200 text-lavender-700' : 'bg-white text-muted ring-1 ring-line'}`}>
                    {rx.status === 'draft' ? 'Not visible to the patient' : 'Withdrawn'}
                  </span>
                </div>
                <Lines rx={rx} />
                {rx.status === 'withdrawn' && (
                  <p className="mt-3 text-[0.95rem] text-muted">
                    Withdrawn on {formatDate(dayOf(rx.withdrawn_at ?? rx.created_at, settings.timezone))}: {rx.withdraw_reason}
                  </p>
                )}
                {rx.status === 'draft' && mine && (
                  confirming === rx.id ? (
                    <div className="mt-4 rounded-2xl border border-sage-300 bg-sage-50 p-4">
                      <p className="font-semibold text-ink">Approve this prescription?</p>
                      <p className="mt-1 text-ink">
                        Check every medicine, dose and duration above{allergies ? `, and the recorded allergies: ${allergies}` : ''}. Once approved, the patient can see and print it, and it can no longer be edited.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <button disabled={busy} className={btnPrimary} onClick={() => void run('approve_prescription', { p_id: rx.id }, 'Prescription approved. The patient can now see it.')}>
                          {busy ? 'Approving…' : 'Yes, approve'}
                        </button>
                        <button className={btnOutline} onClick={() => setConfirming(null)}>
                          Go back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button className={btnPrimary} onClick={() => { setError(''); setConfirming(rx.id); }}>
                        Approve
                      </button>
                      <button className={btnOutline} disabled={editing !== null} onClick={() => { setError(''); setNotice(''); setEditing(rx.id); }}>
                        Edit draft
                      </button>
                      <button className={btnDanger} disabled={busy} onClick={() => void run('delete_draft_prescription', { p_id: rx.id }, 'Draft discarded.')}>
                        Discard draft
                      </button>
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Lines({ rx }: { rx: Prescription }) {
  return (
    <>
      {rx.items.length > 0 && (
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {rx.items.map((item, i) => (
            <li key={i} className="py-3">
              <p className="font-semibold text-ink">
                {i + 1}. {item.medicine_name}
              </p>
              <p className="text-ink">{[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ')}</p>
              {item.instructions && <p className="text-[0.95rem] text-muted">{item.instructions}</p>}
            </li>
          ))}
        </ol>
      )}
      {rx.general_instructions && <p className="mt-3 whitespace-pre-wrap text-ink">{rx.general_instructions}</p>}
    </>
  );
}

interface EditorProps {
  patientId: string;
  prescriptionId?: string;
  allergies: string | null;
  initialLines: Line[];
  initialNotes: string;
  onClose: (saved?: string) => void;
}

/** The prescription form. The doctor types every medicine and dose; nothing is suggested or filled in. */
function PrescriptionEditor({ patientId, prescriptionId, allergies, initialLines, initialNotes, onClose }: EditorProps) {
  const notesId = useId();
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = notes !== initialNotes || JSON.stringify(lines) !== JSON.stringify(initialLines);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setLine = (index: number, key: keyof Line, value: string) => {
    setError('');
    setLines(lines.map((l, i) => (i === index ? { ...l, [key]: value } : l)));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    // A completely empty line is dropped; a line with details but no medicine name is a mistake.
    const used = lines.filter((l) => Object.values(l).some((v) => v.trim()));
    const nameless = used.findIndex((l) => !l.medicine_name.trim());
    if (nameless >= 0) return setError(`Line ${lines.indexOf(used[nameless]) + 1} has no medicine name.`);
    if (used.length === 0 && !notes.trim()) return setError('Add at least one medicine or an instruction.');
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('save_prescription', {
      p_patient_id: patientId,
      p_general_instructions: notes,
      p_items: used,
      p_visit_id: null,
      p_prescription_id: prescriptionId ?? null,
    });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    onClose('Draft saved. The patient cannot see it until you approve it.');
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-4 space-y-5 border-sage-300`}>
      <h3 className="font-display text-2xl">{prescriptionId ? 'Edit draft prescription' : 'New prescription'}</h3>
      <Notice kind="info">
        <span className="font-semibold">Allergies on record: </span>
        {allergies || 'none recorded. Ask the patient and add them to the medical summary.'}
      </Notice>

      {lines.map((line, i) => (
        <fieldset key={i} className="rounded-2xl border border-line p-4">
          <legend className="px-2 font-semibold text-ink">Medicine {i + 1}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Medicine name" value={line.medicine_name} maxLength={120} onChange={(e) => setLine(i, 'medicine_name', e.target.value)} />
            <Field label="Dose" hint="How much each time" value={line.dosage} maxLength={120} onChange={(e) => setLine(i, 'dosage', e.target.value)} />
            <Field label="How often" hint="For example twice a day" value={line.frequency} maxLength={120} onChange={(e) => setLine(i, 'frequency', e.target.value)} />
            <Field label="For how long" value={line.duration} maxLength={120} onChange={(e) => setLine(i, 'duration', e.target.value)} />
            <Field label="Special instructions" value={line.instructions} maxLength={300} onChange={(e) => setLine(i, 'instructions', e.target.value)} />
          </div>
          {lines.length > 1 && (
            <button type="button" className={`${btnSmall} mt-4`} onClick={() => setLines(lines.filter((_, n) => n !== i))}>
              Remove medicine {i + 1}
            </button>
          )}
        </fieldset>
      ))}
      {lines.length < 20 && (
        <button type="button" className={btnSmall} onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
          Add another medicine
        </button>
      )}

      <div>
        <label htmlFor={notesId} className="block font-semibold text-ink">
          General instructions
        </label>
        <p id={`${notesId}-hint`} className="text-[0.95rem] text-muted">
          Advice for the patient, such as skin care or what to avoid. The patient sees this.
        </p>
        <textarea id={notesId} aria-describedby={`${notesId}-hint`} rows={3} maxLength={2000} className={`${inputBox} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      <p className="text-[0.95rem] text-muted">Saving keeps this as a draft. Approving is a separate step.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" className={btnOutline} onClick={() => onClose()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
