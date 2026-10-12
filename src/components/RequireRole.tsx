import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { portalPath, useAuth, type Role } from '../lib/auth';
import { btnOutline, btnPrimary, pageTitle } from '../lib/ui';
import { tr } from '../lib/i18n';

/**
 * Wraps every portal page. It decides what a visitor sees, but it is NOT
 * the security: the database refuses the data regardless of this screen.
 */
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { loading, session, profile, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <p role="status" className="p-10 text-center text-muted">{tr('Loading…', 'लोड होत आहे…')}</p>;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  if (!profile || !profile.is_active) {
    return (
      <Blocked title={profile ? tr('This account has been deactivated', 'हे खाते बंद केले आहे') : tr('We could not find your account', 'तुमचे खाते सापडले नाही')}>
        <p className="mt-3 text-muted">{tr('Please call the clinic for help.', 'मदतीसाठी कृपया क्लिनिकला फोन करा.')}</p>
        <button className={`${btnOutline} mt-8`} onClick={() => void signOut()}>
          {tr('Sign out', 'साइन आउट')}
        </button>
      </Blocked>
    );
  }

  if (profile.role !== role) {
    return (
      <Blocked title={tr('You do not have access to this page', 'हे पान तुमच्यासाठी नाही')}>
        <p className="mt-3 text-muted">{tr('This area is for a different kind of account.', 'हा भाग वेगळ्या प्रकारच्या खात्यासाठी आहे.')}</p>
        <Link to={portalPath(profile.role)} className={`${btnPrimary} mt-8`}>
          {tr('Go to my portal', 'माझ्या पोर्टलवर जा')}
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
