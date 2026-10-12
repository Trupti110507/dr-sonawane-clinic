import { useRef } from 'react';
import { dayOf, timeOf } from '../lib/appointments';
import { formatDate, formatInr, logoUrl, type ClinicSettings } from '../lib/clinic';
import { METHOD_LABEL, type Payment } from '../lib/payments';
import { btnSmall, card } from '../lib/ui';
import { tr } from '../lib/i18n';

interface Props {
  payment: Payment;
  patientName: string;
  settings: ClinicSettings;
  /** Extra buttons beside Print (the administrator's Refund button) */
  actions?: React.ReactNode;
}

/** One receipt, laid out to read on screen and to print on the clinic's letterhead. */
export default function ReceiptSheet({ payment: p, patientName, settings, actions }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const tz = settings.timezone;

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
          <h3 className="text-[1.05rem] font-bold text-ink">{tr('Receipt', 'पावती')} {p.receipt_no}</h3>
          <p className="text-[0.95rem] text-muted">
            {formatDate(dayOf(p.paid_at, tz))}, {timeOf(p.paid_at, tz)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {p.status === 'refunded' && <span className="rounded-full bg-[#fdf3f2] px-3 py-1 text-[0.95rem] font-semibold text-[#8c1d18] ring-1 ring-[#e3b9b6]">{tr('Refunded', 'परत केले')}</span>}
          <span className="no-print flex gap-2">
            <button className={btnSmall} onClick={print}>
              {tr('Print', 'प्रिंट करा')}
            </button>
            {actions}
          </span>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        {(
          [
            [tr('Received from', 'कडून मिळाले'), patientName],
            [tr('For', 'कशासाठी'), p.description],
            [tr('Doctor', 'डॉक्टर'), p.doctor_name],
            [tr('Paid by', 'भरण्याची पद्धत'), METHOD_LABEL[p.method]],
            [tr('UPI reference', 'UPI संदर्भ क्रमांक'), p.upi_ref ?? null],
          ] as [string, string | null][]
        )
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right text-ink">{value}</dd>
            </div>
          ))}
        <div className="flex justify-between gap-4 py-2.5">
          <dt className="font-semibold text-ink">{tr('Amount received', 'मिळालेली रक्कम')}</dt>
          <dd className="text-right text-[1.05rem] font-bold text-ink">{formatInr(p.amount_inr)}</dd>
        </div>
      </dl>
      {p.status === 'refunded' && p.refunded_at && (
        <p className="mt-3 text-[0.95rem] text-muted">
          {tr(`Refunded on ${formatDate(dayOf(p.refunded_at, tz))}`, `${formatDate(dayOf(p.refunded_at, tz))} रोजी परत केले`)}
          {p.refund_reason ? `: ${p.refund_reason}` : ''}.
        </p>
      )}
      <p className="print-only mt-8 text-[0.95rem] text-muted">{tr("This receipt was produced by the clinic's computer system.", 'ही पावती क्लिनिकच्या संगणक प्रणालीतून तयार झाली आहे.')}</p>
    </article>
  );
}
