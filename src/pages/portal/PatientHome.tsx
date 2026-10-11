import { Link } from 'react-router-dom';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { useAuth } from '../../lib/auth';
import { telHref, type ClinicSettings } from '../../lib/clinic';
import { btnOutline, btnPrimary, card, pageTitle } from '../../lib/ui';

export default function PatientHome({ settings }: { settings: ClinicSettings }) {
  const { profile } = useAuth();
  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>Hello, {profile?.full_name}</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-2xl">Appointments</h2>
          <p className="mt-2 text-muted">
            Online booking opens soon. Until then, call the clinic and we will find you a time.
          </p>
          <a href={telHref(settings.phone_primary)} className={`${btnPrimary} mt-5`}>
            Call {settings.phone_primary}
          </a>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">Your details</h2>
          <p className="mt-2 text-muted">
            Keep your date of birth, address and emergency contact up to date.
          </p>
          <Link to="/patient/profile" className={`${btnOutline} mt-5`}>
            Open my profile
          </Link>
        </section>
      </div>
      <p className="mt-6 text-[0.95rem] text-muted">
        Prescriptions, follow-up dates, progress photos and receipts will appear here as the
        clinic switches them on.
      </p>
    </PortalShell>
  );
}
