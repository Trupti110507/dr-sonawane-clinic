import { useEffect, useState } from 'react';
import { SessionProgress } from '../../components/DoctorPlans';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { formatDate } from '../../lib/clinic';
import { PLAN_STATUS_LABEL, type TreatmentPlan } from '../../lib/records';
import { supabase } from '../../lib/supabase';
import { card, pageTitle } from '../../lib/ui';
import { tr } from '../../lib/i18n';

/** The patient's own treatment plans: sessions done and the doctor's instructions. */
export default function PatientTreatment() {
  const [rows, setRows] = useState<TreatmentPlan[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase?.rpc('my_treatment_plans').then(({ data, error: failed }) => {
      if (failed) setError(friendlyError(failed));
      setRows((data as TreatmentPlan[]) ?? []);
    });
  }, []);

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>{tr('Treatment plans', 'उपचार योजना')}</h1>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your treatment plans…', 'तुमच्या उपचार योजना लोड होत आहेत…')}</p>
      ) : rows.length === 0 ? (
        !error && <p className="mt-6 text-muted">{tr('You have no treatment plans. Your doctor adds one when a treatment runs over several sessions.', 'तुमची कोणतीही उपचार योजना नाही. उपचार अनेक सत्रांचा असेल तर डॉक्टर ती तयार करतात.')}</p>
      ) : (
        <ul className="mt-6 max-w-3xl space-y-4">
          {rows.map((p) => (
            <li key={p.id} className={card}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-[1.05rem] font-bold text-ink">{p.title}</h2>
                  <p className="text-[0.95rem] text-muted">
                    {p.doctor_name}, {tr('started', 'सुरुवात')} {formatDate(p.started_on)}
                  </p>
                </div>
                <span className={`self-start rounded-full px-3 py-1 text-[0.95rem] font-semibold ${p.status === 'active' ? 'bg-sage-100 text-sage-900' : 'bg-white text-muted ring-1 ring-line'}`}>
                  {PLAN_STATUS_LABEL[p.status]}
                </span>
              </div>
              <SessionProgress done={p.sessions_done} total={p.total_sessions} />
              {p.patient_instructions && (
                <div className="mt-3">
                  <p className="text-[0.95rem] text-muted">{tr("Your doctor's instructions", 'डॉक्टरांच्या सूचना')}</p>
                  <p className="whitespace-pre-wrap text-ink">{p.patient_instructions}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
