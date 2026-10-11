import { Link } from 'react-router-dom';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { useAuth } from '../../lib/auth';
import { btnPrimary, card, pageTitle } from '../../lib/ui';

export default function AdminHome() {
  const { profile } = useAuth();
  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Hello, {profile?.full_name}</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-2xl">Staff accounts</h2>
          <p className="mt-2 text-muted">Invite doctors and administrators, and switch accounts on or off.</p>
          <Link to="/admin/staff" className={`${btnPrimary} mt-5`}>
            Manage staff
          </Link>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">Coming next</h2>
          <p className="mt-2 text-muted">
            Clinic hours, holidays, services, fees and branding are edited here from the next build
            stage. Until then, change them in Supabase.
          </p>
        </section>
      </div>
    </PortalShell>
  );
}
