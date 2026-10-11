import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface PortalLink {
  to: string;
  label: string;
}

/** Portal layout: a sidebar on large screens, a scrolling tab row on phones. */
export default function PortalShell({ label, links, children }: { label: string; links: PortalLink[]; children: ReactNode }) {
  const look = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full px-4 font-semibold lg:w-full ${
      isActive ? 'bg-sage-600 text-white' : 'text-sage-700 hover:bg-sage-50'
    }`;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-10 lg:py-10">
      <nav aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-3 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
        <p className="hidden px-4 pb-2 text-[0.95rem] text-muted lg:block">{label}</p>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end className={look}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main id="main" className="min-w-0 pt-3 lg:pt-0">
        {children}
      </main>
    </div>
  );
}

export const PATIENT_LINKS: PortalLink[] = [
  { to: '/patient', label: 'Home' },
  { to: '/patient/profile', label: 'My profile' },
];
export const DOCTOR_LINKS: PortalLink[] = [{ to: '/doctor', label: 'Today' }];
export const ADMIN_LINKS: PortalLink[] = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/staff', label: 'Staff accounts' },
];
