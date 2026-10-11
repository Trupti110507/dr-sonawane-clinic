import { useCallback, useEffect, useId, useState } from 'react';
import { friendlyError } from '../lib/auth';
import type { Doctor } from '../lib/clinic';
import { supabase } from '../lib/supabase';
import { btnDanger, btnSmall, inputBox } from '../lib/ui';
import { Notice } from './Field';

interface Link {
  doctor_id: string;
  doctor_name: string;
  source: string;
}

/** Admin only: which doctors may open this patient's record, and adding or removing one. */
export default function CareAccess({ patientId, patientName, doctors }: { patientId: string; patientName: string; doctors: Doctor[] }) {
  const selectId = useId();
  const [links, setLinks] = useState<Link[] | null>(null);
  const [choice, setChoice] = useState('');
  const [confirming, setConfirming] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: failed } = await supabase.rpc('list_care', { p_patient_id: patientId });
    setError(failed ? friendlyError(failed) : '');
    setLinks((data as Link[]) ?? []);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function set(doctorId: string, allow: boolean) {
    if (!supabase || !doctorId) return;
    setConfirming('');
    const { error: failed } = await supabase.rpc('admin_set_care', { p_patient_id: patientId, p_doctor_id: doctorId, p_allow: allow });
    if (failed) setError(friendlyError(failed));
    setChoice('');
    await load();
  }

  const free = doctors.filter((d) => !(links ?? []).some((l) => l.doctor_id === d.id));

  return (
    <div className="mt-3 rounded-2xl border border-line bg-sage-50 p-4">
      <p className="font-semibold text-ink">Doctors who can open {patientName || 'this patient'}&rsquo;s record</p>
      {error && (
        <div className="mt-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {links === null ? (
        <p role="status" className="mt-2 text-muted">Loading…</p>
      ) : links.length === 0 ? (
        <p className="mt-2 text-muted">None yet. A doctor gets access when this patient books with them.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {links.map((l) => (
            <li key={l.doctor_id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                {l.doctor_name} <span className="text-muted">({l.source === 'assigned' ? 'assigned by an administrator' : 'through an appointment'})</span>
              </span>
              {confirming === l.doctor_id ? (
                <span className="flex gap-2">
                  <button className={btnDanger} onClick={() => void set(l.doctor_id, false)}>
                    Yes, remove access
                  </button>
                  <button className={btnSmall} onClick={() => setConfirming('')}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className={btnSmall} aria-label={`Remove access for ${l.doctor_name}`} onClick={() => setConfirming(l.doctor_id)}>
                  Remove access
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <label htmlFor={selectId} className="block text-[0.95rem] font-semibold text-ink">
              Give another doctor access
            </label>
            <select id={selectId} className={inputBox} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Select a doctor</option>
              {free.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>
          <button className={`${btnSmall} min-h-12`} disabled={!choice} onClick={() => void set(choice, true)}>
            Give access
          </button>
        </div>
      )}
    </div>
  );
}
