import { useId, useState, type FormEvent } from 'react';
import { friendlyError } from '../lib/auth';
import { formatDate } from '../lib/clinic';
import { PLAN_STATUS_LABEL, type PlanStatus, type TreatmentPlan } from '../lib/records';
import { supabase } from '../lib/supabase';
import { btnOutline, btnPrimary, btnSmall, card, inputBox } from '../lib/ui';
import Field, { Notice } from './Field';

interface Props {
  patientId: string;
  plans: TreatmentPlan[];
  myDoctorId: string;
  onChanged: () => Promise<void> | void;
}

type Form = { title: string; patient_instructions: string; clinical_notes: string; total_sessions: string; sessions_done: string; status: PlanStatus };
const EMPTY: Form = { title: '', patient_instructions: '', clinical_notes: '', total_sessions: '', sessions_done: '0', status: 'active' };

/** A bar showing sessions done out of the total. */
export function SessionProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-3">
      <p className="font-semibold text-ink">
        {done} of {total} sessions done
      </p>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-sage-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Sessions done">
        <div className="h-full rounded-full bg-sage-600" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Treatment plans inside the patient record: courses that run over several sessions. */
export default function DoctorPlans({ patientId, plans, myDoctorId, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shown inside this section, next to what was just done
  const [notice, setNotice] = useState('');
  // The message appears only once the list on screen is up to date.
  const changed = async (text: string) => {
    await onChanged();
    setNotice(text);
  };

  async function save(plan: TreatmentPlan, change: Partial<Pick<TreatmentPlan, 'sessions_done' | 'status'>>, done: string) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { error: failed } = await supabase.rpc('save_treatment_plan', {
      p_patient_id: patientId,
      p_title: plan.title,
      p_patient_instructions: plan.patient_instructions ?? '',
      p_clinical_notes: plan.clinical_notes ?? '',
      p_total_sessions: plan.total_sessions,
      p_sessions_done: change.sessions_done ?? plan.sessions_done,
      p_status: change.status ?? plan.status,
      p_plan_id: plan.id,
    });
    if (failed) {
      setBusy(false);
      return setError(friendlyError(failed));
    }
    await changed(done);
    setBusy(false);
  }

  return (
    <section className="mt-10 max-w-3xl" aria-labelledby="plans-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="plans-title" className="font-display text-2xl">
          Treatment plans
        </h2>
        {editing === null && (
          <button className={btnPrimary} onClick={() => { setError(''); setNotice(''); setEditing('new'); }}>
            New treatment plan
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
      {editing === 'new' && <PlanEditor patientId={patientId} initial={EMPTY} onClose={(saved) => { setEditing(null); if (saved) void changed(saved); }} />}

      {plans.length === 0 ? (
        editing === null && <p className="mt-4 text-muted">No treatment plans yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {plans.map((p) => {
            const mine = p.doctor_id === myDoctorId;
            if (editing === p.id) {
              return (
                <li key={p.id}>
                  <PlanEditor
                    patientId={patientId}
                    planId={p.id}
                    initial={{
                      title: p.title,
                      patient_instructions: p.patient_instructions ?? '',
                      clinical_notes: p.clinical_notes ?? '',
                      total_sessions: String(p.total_sessions),
                      sessions_done: String(p.sessions_done),
                      status: p.status,
                    }}
                    onClose={(saved) => { setEditing(null); if (saved) void changed(saved); }}
                  />
                </li>
              );
            }
            const last = p.sessions_done + 1 >= p.total_sessions;
            return (
              <li key={p.id} className={card}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-[1.05rem] font-bold text-ink">{p.title}</h3>
                    <p className="text-[0.95rem] text-muted">
                      {p.doctor_name}, started {formatDate(p.started_on)}
                    </p>
                  </div>
                  <span className={`self-start rounded-full px-3 py-1 text-[0.95rem] font-semibold ${p.status === 'active' ? 'bg-sage-100 text-sage-900' : 'bg-white text-muted ring-1 ring-line'}`}>
                    {PLAN_STATUS_LABEL[p.status]}
                  </span>
                </div>
                <SessionProgress done={p.sessions_done} total={p.total_sessions} />
                {p.patient_instructions && (
                  <div className="mt-3">
                    <p className="text-[0.95rem] text-muted">Instructions for the patient</p>
                    <p className="whitespace-pre-wrap text-ink">{p.patient_instructions}</p>
                  </div>
                )}
                {p.clinical_notes && (
                  <div className="mt-3">
                    <p className="text-[0.95rem] text-muted">Clinical notes (doctors only)</p>
                    <p className="whitespace-pre-wrap text-ink">{p.clinical_notes}</p>
                  </div>
                )}
                {mine && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {p.status === 'active' && p.sessions_done < p.total_sessions && (
                      <button
                        className={btnPrimary}
                        disabled={busy}
                        onClick={() =>
                          void save(p, { sessions_done: p.sessions_done + 1, status: last ? 'completed' : 'active' }, last ? 'Final session recorded. The plan is completed.' : `Session ${p.sessions_done + 1} recorded.`)
                        }
                      >
                        Record session {p.sessions_done + 1}
                      </button>
                    )}
                    <button className={btnOutline} disabled={editing !== null} onClick={() => { setError(''); setNotice(''); setEditing(p.id); }}>
                      Edit plan
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PlanEditor({ patientId, planId, initial, onClose }: { patientId: string; planId?: string; initial: Form; onClose: (saved?: string) => void }) {
  const patientNotesId = useId();
  const clinicalId = useId();
  const statusId = useId();
  const [form, setForm] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; total?: string; done?: string }>({});
  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const total = Number(form.total_sessions);
    const done = Number(form.sessions_done || '0');
    const problems: typeof fieldErrors = {};
    if (form.title.trim().length < 2) problems.title = 'Give the plan a name, for example Chemical peel course.';
    if (!Number.isInteger(total) || total < 1 || total > 60) problems.total = 'Enter a whole number from 1 to 60.';
    else if (!Number.isInteger(done) || done < 0 || done > total) problems.done = `Enter a whole number from 0 to ${total}.`;
    setFieldErrors(problems);
    if (Object.keys(problems).length || !supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('save_treatment_plan', {
      p_patient_id: patientId,
      p_title: form.title,
      p_patient_instructions: form.patient_instructions,
      p_clinical_notes: form.clinical_notes,
      p_total_sessions: total,
      p_sessions_done: done,
      p_status: form.status,
      p_plan_id: planId ?? null,
    });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    onClose(planId ? 'Treatment plan updated.' : 'Treatment plan saved. The patient can see it.');
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-4 space-y-5 border-sage-300`}>
      <h3 className="font-display text-2xl">{planId ? 'Edit treatment plan' : 'New treatment plan'}</h3>
      <Field label="Name of the plan" hint="For example Chemical peel course" value={form.title} maxLength={120} error={fieldErrors.title} onChange={set('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Number of sessions" inputMode="numeric" value={form.total_sessions} maxLength={2} error={fieldErrors.total} onChange={set('total_sessions')} />
        {planId && <Field label="Sessions done" inputMode="numeric" value={form.sessions_done} maxLength={2} error={fieldErrors.done} onChange={set('sessions_done')} />}
      </div>
      <div>
        <label htmlFor={patientNotesId} className="block font-semibold text-ink">
          Instructions for the patient
        </label>
        <p className="text-[0.95rem] text-muted">The patient sees this in their portal.</p>
        <textarea id={patientNotesId} rows={3} maxLength={2000} className={`${inputBox} py-3`} value={form.patient_instructions} onChange={set('patient_instructions')} />
      </div>
      <div>
        <label htmlFor={clinicalId} className="block font-semibold text-ink">
          Clinical notes
        </label>
        <p className="text-[0.95rem] text-muted">For doctors only. The patient does not see this.</p>
        <textarea id={clinicalId} rows={3} maxLength={2000} className={`${inputBox} py-3`} value={form.clinical_notes} onChange={set('clinical_notes')} />
      </div>
      {planId && (
        <div className="max-w-xs">
          <label htmlFor={statusId} className="block font-semibold text-ink">
            Status
          </label>
          <select id={statusId} className={inputBox} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PlanStatus })}>
            <option value="active">In progress</option>
            <option value="completed">Completed</option>
            <option value="stopped">Stopped</option>
          </select>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : planId ? 'Save changes' : 'Save plan'}
        </button>
        <button type="button" className={btnSmall} onClick={() => onClose()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
