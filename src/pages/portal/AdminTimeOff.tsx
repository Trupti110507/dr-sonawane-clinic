import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import TimeOffManager from '../../components/TimeOffManager';
import type { ClinicData } from '../../lib/clinic';
import { pageTitle } from '../../lib/ui';

export default function AdminTimeOff({ clinic }: { clinic: ClinicData }) {
  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Doctor leave</h1>
      <TimeOffManager clinic={clinic} chooseDoctor />
    </PortalShell>
  );
}
