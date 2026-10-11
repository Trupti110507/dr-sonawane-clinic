import { Link } from 'react-router-dom';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { useAuth } from '../../lib/auth';
import { pageTitle } from '../../lib/ui';

const AREAS = [
  { to: '/admin/clinic', title: 'Clinic details', text: 'Name, headings, address, phone numbers, logo, colours and appointment length.' },
  { to: '/admin/hours', title: 'Hours and holidays', text: 'Opening times for each day, and the days the clinic is closed.' },
  { to: '/admin/services', title: 'Services and fees', text: 'Add, reprice or retire consultations and procedures.' },
  { to: '/admin/doctors', title: 'Doctors', text: 'Names, qualifications, fees and photos shown on the website.' },
  { to: '/admin/patients', title: 'Patients', text: 'Registered patients, with contact details and account status.' },
  { to: '/admin/staff', title: 'Staff accounts', text: 'Invite doctors and administrators, and switch accounts on or off.' },
];

export default function AdminHome() {
  const { profile } = useAuth();
  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Hello, {profile?.full_name}</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {AREAS.map((a) => (
          <li key={a.to}>
            <Link to={a.to} className="block h-full rounded-2xl border border-line bg-white p-5 hover:border-sage-300 hover:bg-sage-50 sm:p-6">
              <span className="block font-display text-2xl text-ink">{a.title}</span>
              <span className="mt-1 block text-muted">{a.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[0.95rem] text-muted">
        Appointments, payments and reports are added here in the coming build stages.
      </p>
    </PortalShell>
  );
}
