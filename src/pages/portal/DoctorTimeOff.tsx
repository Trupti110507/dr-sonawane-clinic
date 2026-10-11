import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import TimeOffManager from '../../components/TimeOffManager';
import type { ClinicData } from '../../lib/clinic';
import { pageTitle } from '../../lib/ui';

export default function DoctorTimeOff({ clinic }: { clinic: ClinicData }) {
  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <h1 className={pageTitle}>My time off</h1>
      <TimeOffManager clinic={clinic} chooseDoctor={false} />
    </PortalShell>
  );
}
