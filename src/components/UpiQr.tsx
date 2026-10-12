import { useEffect, useState } from 'react';
import { formatInr } from '../lib/clinic';
import { tr } from '../lib/i18n';
import { btnPrimary } from '../lib/ui';
import { isPhone, qrPicture, upiLink } from '../lib/upi';

interface Props {
  upiId: string;
  payeeName: string;
  amountInr: number;
  /** Shown beside the payment in the clinic's UPI app, to tell payments apart */
  note: string;
}

/** A UPI QR code for an exact amount, with a tap-to-pay button on phones. */
export default function UpiQr({ upiId, payeeName, amountInr, note }: Props) {
  const link = upiLink({ upiId, payeeName, amountInr, note });
  const [picture, setPicture] = useState('');

  useEffect(() => {
    let live = true;
    qrPicture(link).then((p) => live && setPicture(p)).catch(() => live && setPicture(''));
    return () => {
      live = false;
    };
  }, [link]);

  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <p className="font-semibold text-ink">{tr(`Scan to pay ${formatInr(amountInr)}`, `${formatInr(amountInr)} भरण्यासाठी स्कॅन करा`)}</p>
      <p className="text-[0.95rem] text-muted">{tr('With any UPI app: PhonePe, Google Pay, Paytm, BHIM', 'कोणत्याही UPI ॲपने: PhonePe, Google Pay, Paytm, BHIM')}</p>
      {picture ? (
        <img src={picture} alt={tr(`UPI QR code to pay ${formatInr(amountInr)} to ${payeeName}`, `${payeeName} यांना ${formatInr(amountInr)} भरण्यासाठी UPI QR कोड`)} className="mx-auto mt-3 h-56 w-56" />
      ) : (
        <div role="status" className="mx-auto mt-3 flex h-56 w-56 items-center justify-center text-muted">
          {tr('Making the QR code…', 'QR कोड तयार होत आहे…')}
        </div>
      )}
      <p className="mt-2 font-semibold text-ink">{payeeName}</p>
      <p className="break-all text-[0.95rem] text-muted">{upiId}</p>
      {isPhone() && (
        <a href={link} className={`${btnPrimary} mt-3 w-full`}>
          {tr('Open my UPI app', 'माझे UPI ॲप उघडा')}
        </a>
      )}
      <p className="mt-3 text-left text-[0.95rem] text-muted">
        {tr(
          'Check that the name shown in your UPI app is the clinic’s before you enter your UPI PIN.',
          'UPI PIN टाकण्यापूर्वी तुमच्या UPI ॲपमध्ये क्लिनिकचेच नाव दिसते आहे का ते तपासा.',
        )}
      </p>
    </div>
  );
}
