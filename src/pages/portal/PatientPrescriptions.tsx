import { useEffect, useState } from 'react';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import PrescriptionSheet from '../../components/PrescriptionSheet';
import { friendlyError, useAuth } from '../../lib/auth';
import { telHref, type ClinicData } from '../../lib/clinic';
import type { Prescription } from '../../lib/records';
import { supabase } from '../../lib/supabase';
import { pageTitle, textLink } from '../../lib/ui';
import { tr } from '../../lib/i18n';

/** The patient's own prescriptions. Only those the doctor has approved are ever sent here. */
export default function PatientPrescriptions({ clinic }: { clinic: ClinicData }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Prescription[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase?.rpc('my_prescriptions').then(({ data, error: failed }) => {
      if (failed) setError(friendlyError(failed));
      setRows((data as Prescription[]) ?? []);
    });
  }, []);

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>{tr('Prescriptions', 'प्रिस्क्रिप्शन')}</h1>
      <p className="mt-2 max-w-3xl text-muted">
        {tr(
          'Take medicines exactly as written. If anything is unclear or you feel unwell, call the clinic on',
          'औषधे लिहिल्याप्रमाणेच घ्या. काही समजले नाही किंवा बरे वाटत नसेल तर क्लिनिकला फोन करा:',
        )}{' '}
        <a href={telHref(clinic.settings.phone_primary)} className={textLink}>
          {clinic.settings.phone_primary}
        </a>
        .
      </p>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {rows === null ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your prescriptions…', 'तुमची प्रिस्क्रिप्शन लोड होत आहेत…')}</p>
      ) : rows.length === 0 ? (
        !error && <p className="mt-6 text-muted">{tr('You have no prescriptions yet. A prescription appears here once your doctor approves it.', 'अजून कोणतेही प्रिस्क्रिप्शन नाही. डॉक्टरांनी मंजूर केल्यावर ते इथे दिसेल.')}</p>
      ) : (
        <ul className="mt-6 max-w-3xl space-y-4">
          {rows.map((rx) => (
            <li key={rx.id}>
              <PrescriptionSheet rx={rx} settings={clinic.settings} patientName={profile?.full_name ?? ''} />
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
