import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { loadClinic, type ClinicData } from './lib/clinic';
import Welcome from './pages/Welcome';
import ComingSoon from './pages/ComingSoon';
import SignIn from './pages/SignIn';
import StaffActivate from './pages/StaffActivate';
import ResetPassword from './pages/ResetPassword';
import PatientWelcome from './pages/portal/PatientWelcome';
import PatientHome from './pages/portal/PatientHome';
import PatientProfile from './pages/portal/PatientProfile';
import DoctorHome from './pages/portal/DoctorHome';
import AdminHome from './pages/portal/AdminHome';
import AdminStaff from './pages/portal/AdminStaff';
import SiteHeader from './components/SiteHeader';
import RequireRole from './components/RequireRole';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clinic: ClinicData };

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    loadClinic()
      .then((clinic) => {
        // Apply the clinic's saved brand colours and name to the whole app.
        const root = document.documentElement.style;
        root.setProperty('--brand-primary', clinic.settings.primary_color);
        root.setProperty('--brand-accent', clinic.settings.accent_color);
        document.title = [clinic.settings.name, clinic.settings.subtitle].filter(Boolean).join(' | ');
        setState({ status: 'ready', clinic });
      })
      .catch((e: Error) => setState({ status: 'error', message: e.message }));
  }, []);

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-10 text-center text-muted">
        Loading clinic information…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-xl p-8">
        <div role="alert" className="rounded-2xl border border-line bg-sage-50 p-6">
          <h1 className="font-display text-2xl">We could not load the clinic information</h1>
          <p className="mt-2 text-muted">
            Check that the Stage 1 SQL file was run in Supabase and that the two values in the
            .env file are correct, then refresh this page.
          </p>
          <p className="mt-3 text-sm text-muted">Technical detail: {state.message}</p>
        </div>
      </main>
    );
  }

  const { clinic } = state;
  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      {clinic.source === 'sample' && (
        <p className="bg-lavender-100 px-4 py-2 text-center text-sm text-ink">
          Preview mode: showing built-in sample data. Connect Supabase (README, Part B) to load
          live data.
        </p>
      )}
      <SiteHeader settings={clinic.settings} />
      <Routes>
        <Route path="/" element={<Welcome clinic={clinic} />} />
        <Route
          path="/book"
          element={<ComingSoon title="Online booking" stage="Stage 4" settings={clinic.settings} />}
        />
        {/* Accounts */}
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/staff/activate" element={<StaffActivate />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Patient portal */}
        <Route path="/patient/welcome" element={<RequireRole role="patient"><PatientWelcome clinicName={clinic.settings.name} /></RequireRole>} />
        <Route path="/patient" element={<RequireRole role="patient"><PatientHome settings={clinic.settings} /></RequireRole>} />
        <Route path="/patient/profile" element={<RequireRole role="patient"><PatientProfile /></RequireRole>} />

        {/* Doctor portal */}
        <Route path="/doctor" element={<RequireRole role="doctor"><DoctorHome /></RequireRole>} />

        {/* Admin portal */}
        <Route path="/admin" element={<RequireRole role="admin"><AdminHome /></RequireRole>} />
        <Route path="/admin/staff" element={<RequireRole role="admin"><AdminStaff /></RequireRole>} />

        <Route
          path="*"
          element={<ComingSoon title="Page not found" stage={null} settings={clinic.settings} />}
        />
      </Routes>
    </div>
  );
}
