import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import { useAuth } from '../../lib/auth';
import { card, pageTitle } from '../../lib/ui';

export default function DoctorHome() {
  const { profile } = useAuth();
  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <h1 className={pageTitle}>{profile?.full_name}</h1>
      <section className={`${card} mt-6 max-w-2xl`}>
        <h2 className="font-display text-2xl">Today</h2>
        <p className="mt-2 text-muted">
          Your account is active. The appointment calendar, patient records, prescriptions and
          progress photos arrive in the next build stages.
        </p>
      </section>
    </PortalShell>
  );
}
