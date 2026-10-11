import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { portalPath, useAuth, type Role } from '../lib/auth';
import { btnOutline, btnPrimary, pageTitle } from '../lib/ui';

/**
 * Wraps every portal page. It decides what a visitor sees, but it is NOT
 * the security: the database refuses the data regardless of this screen.
 */
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { loading, session, profile, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <p role="status" className="p-10 text-center text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  if (!profile || !profile.is_active) {
    return (
      <Blocked title={profile ? 'This account has been deactivated' : 'We could not find your account'}>
        <p className="mt-3 text-muted">Please call the clinic for help.</p>
        <button className={`${btnOutline} mt-8`} onClick={() => void signOut()}>
          Sign out
        </button>
      </Blocked>
    );
  }

  if (profile.role !== role) {
    return (
      <Blocked title="You do not have access to this page">
        <p className="mt-3 text-muted">This area is for a different kind of account.</p>
        <Link to={portalPath(profile.role)} className={`${btnPrimary} mt-8`}>
          Go to my portal
        </Link>
      </Blocked>
    );
  }

  // A patient who has not yet given their name and consent finishes that first.
  if (role === 'patient' && !profile.full_name && location.pathname !== '/patient/welcome') {
    return <Navigate to="/patient/welcome" replace />;
  }

  return <>{children}</>;
}

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className={pageTitle}>{title}</h1>
      {children}
    </main>
  );
}
