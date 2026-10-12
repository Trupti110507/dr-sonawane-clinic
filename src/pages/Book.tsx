import { Link, useNavigate } from 'react-router-dom';
import BookingFlow from '../components/BookingFlow';
import { portalPath, useAuth } from '../lib/auth';
import { telHref, type ClinicData } from '../lib/clinic';
import { btnOutline, btnPrimary, pageTitle } from '../lib/ui';
import { tr } from '../lib/i18n';

/** The public "Book appointment" address. Patients book here; everyone else is pointed the right way. */
export default function Book({ clinic }: { clinic: ClinicData }) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const { settings } = clinic;

  if (loading) return <p role="status" className="p-10 text-center text-muted">{tr('Loading…', 'लोड होत आहे…')}</p>;

  if (!session || !profile) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <h1 className={pageTitle}>{tr('Book an appointment', 'अपॉइंटमेंट बुक करा')}</h1>
        <p className="mt-3 text-muted">
          {tr(
            'Sign in with your patient number and PIN to choose a day and time. New patient? Call the clinic to book, or visit the desk to get your patient number.',
            'दिवस आणि वेळ निवडण्यासाठी तुमचा रुग्ण क्रमांक आणि PIN वापरून साइन इन करा. नवीन रुग्ण आहात? बुक करण्यासाठी क्लिनिकला फोन करा, किंवा रुग्ण क्रमांक घेण्यासाठी क्लिनिकमध्ये या.',
          )}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/sign-in" className={btnPrimary}>
            {tr('Sign in to book', 'बुक करण्यासाठी साइन इन करा')}
          </Link>
          <a href={telHref(settings.phone_primary)} className={btnOutline}>
            {tr(`Call ${settings.phone_primary}`, `${settings.phone_primary} वर कॉल करा`)}
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
        <h1 className={pageTitle}>{tr('One step first', 'आधी एक पायरी')}</h1>
        <p className="mt-3 text-muted">{tr('Please tell us your name before booking.', 'बुक करण्यापूर्वी कृपया तुमचे नाव सांगा.')}</p>
        <Link to="/patient/welcome" className={`${btnPrimary} mt-8`}>
          {tr('Continue', 'पुढे चला')}
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className={pageTitle}>{tr('Book an appointment', 'अपॉइंटमेंट बुक करा')}</h1>
      <div className="mt-8">
        <BookingFlow clinic={clinic} doneLabel={tr('See my appointments', 'माझ्या अपॉइंटमेंट पहा')} onClose={() => navigate('/patient/appointments')} />
      </div>
    </main>
  );
}
