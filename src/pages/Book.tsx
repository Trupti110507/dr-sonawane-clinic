import { Link, useNavigate } from 'react-router-dom';
import BookingFlow from '../components/BookingFlow';
import { portalPath, useAuth } from '../lib/auth';
import { telHref, type ClinicData } from '../lib/clinic';
import { btnOutline, btnPrimary, pageTitle } from '../lib/ui';

/** The public "Book appointment" address. Patients book here; everyone else is pointed the right way. */
export default function Book({ clinic }: { clinic: ClinicData }) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const { settings } = clinic;

  if (loading) return <p role="status" className="p-10 text-center text-muted">Loading…</p>;

  if (!session || !profile) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <h1 className={pageTitle}>Book an appointment</h1>
        <p className="mt-3 text-muted">
          Sign in with your mobile number to choose a day and time. It takes about a minute, and
          new patients are welcome.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/sign-in" className={btnPrimary}>
            Sign in to book
          </Link>
          <a href={telHref(settings.phone_primary)} className={btnOutline}>
            Call {settings.phone_primary}
          </a>
        </div>
      </main>
    );
  }

  if (profile.role !== 'patient') {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <h1 className={pageTitle}>Book an appointment</h1>
        <p className="mt-3 text-muted">
          {profile.role === 'admin'
            ? 'To book for a patient, use Appointments in the Admin portal.'
            : 'To book a follow-up for a patient, use Today in the Doctor portal.'}
        </p>
        <Link to={profile.role === 'admin' ? '/admin/appointments' : portalPath(profile.role)} className={`${btnPrimary} mt-8`}>
          Go to my portal
        </Link>
      </main>
    );
  }

  if (!profile.full_name) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <h1 className={pageTitle}>One step first</h1>
        <p className="mt-3 text-muted">Please tell us your name before booking.</p>
        <Link to="/patient/welcome" className={`${btnPrimary} mt-8`}>
          Continue
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className={pageTitle}>Book an appointment</h1>
      <div className="mt-8">
        <BookingFlow clinic={clinic} doneLabel="See my appointments" onClose={() => navigate('/patient/appointments')} />
      </div>
    </main>
  );
}
