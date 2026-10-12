import { useRef } from 'react';
import { dayOf } from '../lib/appointments';
import { formatDate, logoUrl, type ClinicSettings } from '../lib/clinic';
import type { Prescription } from '../lib/records';
import { btnSmall, card } from '../lib/ui';
import { tr } from '../lib/i18n';

interface Props {
  rx: Prescription;
  settings: ClinicSettings;
  patientName: string;
  /** Extra buttons shown beside Print (the doctor's Withdraw button) */
  actions?: React.ReactNode;
}

/** One prescription, laid out to read on screen and to print on the clinic's letterhead. */
export default function PrescriptionSheet({ rx, settings, patientName, actions }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const date = dayOf(rx.approved_at ?? rx.created_at, settings.timezone);

  // Mark just this prescription for the printer, print, then remove the mark.
  function print() {
    sheet.current?.classList.add('print-sheet');
    window.print();
    sheet.current?.classList.remove('print-sheet');
  }

  return (
    <article ref={sheet} className={card}>
      <header className="print-only border-b border-line pb-4">
        <div className="flex items-center gap-4">
          <img src={logoUrl(settings)} alt="" className="h-14 w-14 object-contain" />
          <div>
            <p className="font-display text-2xl text-ink">{settings.name}</p>
            <p className="text-ink">{[settings.tagline, settings.subtitle].filter(Boolean).join(' · ')}</p>
            <p className="text-[0.95rem] text-muted">
              {settings.address}, {settings.city} · {[settings.phone_primary, settings.phone_secondary].filter(Boolean).join(' / ')}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:mt-4">
        <div>
          <h3 className="text-[1.05rem] font-bold text-ink">{tr(`Prescription of ${formatDate(date)}`, `${formatDate(date)} चे प्रिस्क्रिप्शन`)}</h3>
          <p className="text-[0.95rem] text-muted">
            {rx.doctor_name}
            {rx.doctor_qualification ? `, ${rx.doctor_qualification}` : ''}
            {rx.doctor_registration_no ? ` · ${tr('Reg. no.', 'नोंदणी क्र.')} ${rx.doctor_registration_no}` : ''}
          </p>
          <p className="text-[0.95rem] text-muted">{tr('Patient', 'रुग्ण')}: {patientName}</p>
        </div>
        {rx.status === 'approved' && (
          <div className="no-print flex shrink-0 gap-2">
            <button className={btnSmall} onClick={print}>
              {tr('Print', 'प्रिंट करा')}
            </button>
            {actions}
          </div>
        )}
      </div>

      {rx.items.length > 0 && (
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {rx.items.map((item, i) => (
            <li key={i} className="py-3">
              <p className="font-semibold text-ink">
                {i + 1}. {item.medicine_name}
              </p>
              <p className="text-ink">{[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ')}</p>
              {item.instructions && <p className="text-[0.95rem] text-muted">{item.instructions}</p>}
            </li>
          ))}
        </ol>
      )}
      {rx.general_instructions && (
        <div className="mt-4">
          <p className="text-[0.95rem] text-muted">{tr('Instructions', 'सूचना')}</p>
          <p className="whitespace-pre-wrap text-ink">{rx.general_instructions}</p>
        </div>
      )}
      {rx.approved_at && (
        <p className="mt-4 text-[0.95rem] text-muted">
          {tr(
            `Approved by ${rx.doctor_name} on ${formatDate(dayOf(rx.approved_at, settings.timezone))}.`,
            `${rx.doctor_name} यांनी ${formatDate(dayOf(rx.approved_at, settings.timezone))} रोजी मंजूर केले.`,
          )}
        </p>
      )}
      <p className="print-only mt-10 text-ink">{tr("Doctor's signature", 'डॉक्टरांची सही')}: ______________________</p>
    </article>
  );
}
