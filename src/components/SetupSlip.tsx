import { useRef } from 'react';
import { dayOf } from '../lib/appointments';
import { formatDate, logoUrl, type ClinicSettings } from '../lib/clinic';
import { btnPrimary, btnSmall, card } from '../lib/ui';

interface Props {
  settings: ClinicSettings;
  patientName: string;
  patientNo: number;
  setupCode: string;
  expiresAt: string;
  onDone: () => void;
}

/** The slip handed to a patient: patient number and one-time setup code, with simple steps. Printable. */
export default function SetupSlip({ settings, patientName, patientNo, setupCode, expiresAt, onDone }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const site = window.location.host;

  function print() {
    sheet.current?.classList.add('print-sheet');
    window.print();
    sheet.current?.classList.remove('print-sheet');
  }

  return (
    <article ref={sheet} className={`${card} mt-6 max-w-3xl border-sage-300`} aria-labelledby="slip-title">
      <header className="print-only border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <img src={logoUrl(settings)} alt="" className="h-12 w-12 object-contain" />
          <div>
            <p className="font-display text-2xl text-ink">{settings.name}</p>
            <p className="text-[0.95rem] text-muted">{[settings.phone_primary, settings.phone_secondary].filter(Boolean).join(' / ')}</p>
          </div>
        </div>
      </header>
      <h2 id="slip-title" className="font-display text-2xl print:mt-4">
        Sign-in slip for {patientName}
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-sage-50 p-4">
          <dt className="text-muted">Patient number</dt>
          <dd className="font-display text-4xl tracking-wider text-ink">{patientNo}</dd>
          <dd className="text-[0.95rem] text-muted">Keep this. It is the same every time.</dd>
        </div>
        <div className="rounded-2xl bg-lavender-100 p-4">
          <dt className="text-muted">Setup code (use once)</dt>
          <dd className="font-display text-4xl tracking-[0.2em] text-ink">{setupCode}</dd>
          <dd className="text-[0.95rem] text-muted">Valid until {formatDate(dayOf(expiresAt, settings.timezone))}</dd>
        </div>
      </dl>
      <ol className="mt-5 list-decimal space-y-1.5 pl-6 text-ink">
        <li>
          On your phone, open <span className="font-semibold">{site}</span>
        </li>
        <li>Tap Sign in, then Patient, then First time or forgot PIN</li>
        <li>Type your patient number and this setup code</li>
        <li>Choose your own 6-digit PIN. Next time you only need your patient number and PIN</li>
      </ol>
      <p className="mt-4 text-[0.95rem] text-muted">Keep your PIN secret. Clinic staff will never ask for it. If you forget it, ask at the clinic for a new setup code.</p>
      <div className="no-print mt-5 flex flex-col gap-3 sm:flex-row">
        <button className={btnPrimary} onClick={print}>
          Print slip
        </button>
        <button className={btnSmall} onClick={onDone}>
          Done
        </button>
      </div>
      <p className="no-print mt-3 text-[0.95rem] text-muted">
        The setup code is shown only now. If the slip is lost, give a new code from the patient list.
      </p>
    </article>
  );
}
