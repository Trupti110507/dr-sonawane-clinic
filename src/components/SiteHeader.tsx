import { Link, useNavigate } from 'react-router-dom';
import { portalPath, useAuth } from '../lib/auth';
import { logoUrl, type ClinicSettings } from '../lib/clinic';

const navLink =
  'inline-flex min-h-11 items-center rounded-full px-3 text-[0.95rem] font-medium text-ink hover:text-sage-700';
const pillOutline =
  'inline-flex min-h-11 shrink-0 items-center rounded-full border border-sage-300 px-4 text-[0.95rem] font-semibold text-sage-700 hover:bg-sage-50 sm:px-5';
const pillFilled =
  'min-h-11 shrink-0 items-center rounded-full bg-sage-600 px-5 text-[0.95rem] font-semibold text-white hover:bg-sage-700';

/** The header shared by every portal: logo, clinic name, navigation, account. */
export default function SiteHeader({ settings }: { settings: ClinicSettings }) {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          {/* Clinic logo: uploaded in Admin > Clinic details; falls back to public/logo.png */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-50 ring-1 ring-sage-200 sm:h-12 sm:w-12">
            <img src={logoUrl(settings)} alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[1.05rem] leading-tight text-ink sm:text-xl">
              {settings.name}
            </span>
            {settings.tagline && (
              <span className="hidden truncate text-sm text-muted sm:block">{settings.tagline}</span>
            )}
          </span>
        </Link>

        {!session && (
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <a href="/#services" className={navLink}>
              Services and fees
            </a>
            <a href="/#doctors" className={navLink}>
              Doctors
            </a>
            <a href="/#visit" className={navLink}>
              Hours and location
            </a>
          </nav>
        )}

        {session ? (
          <div className="flex shrink-0 items-center gap-2">
            {profile?.full_name && (
              <span className="hidden max-w-[14rem] truncate text-[0.95rem] text-muted md:block">
                {profile.full_name}
              </span>
            )}
            {profile && (
              <Link to={portalPath(profile.role)} className={`${pillFilled} hidden sm:inline-flex`}>
                My portal
              </Link>
            )}
            <button
              className={pillOutline}
              onClick={() => {
                // Leave the portal first, then sign out, so the visitor lands on the home page.
                navigate('/');
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/sign-in" className={pillOutline}>
              Sign in
            </Link>
            <Link to="/book" className={`${pillFilled} hidden md:inline-flex`}>
              Book appointment
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
