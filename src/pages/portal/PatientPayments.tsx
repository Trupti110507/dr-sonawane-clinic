import { useCallback, useEffect, useState } from 'react';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import ReceiptSheet from '../../components/ReceiptSheet';
import UpiQr from '../../components/UpiQr';
import { dayOf, timeOf } from '../../lib/appointments';
import { friendlyError, useAuth } from '../../lib/auth';
import { formatDate, formatInr, type ClinicData } from '../../lib/clinic';
import { payOnline, type Payment, type UnpaidAppointment } from '../../lib/payments';
import { supabase } from '../../lib/supabase';
import { btnOutline, btnPrimary, card, pageTitle } from '../../lib/ui';
import { tr } from '../../lib/i18n';

/** The patient's own payments: what is still to pay, and every receipt. */
export default function PatientPayments({ clinic }: { clinic: ClinicData }) {
  const { profile } = useAuth();
  const { settings } = clinic;
  const tz = settings.timezone;
  const [due, setDue] = useState<UnpaidAppointment[] | null>(null);
  const [receipts, setReceipts] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paying, setPaying] = useState('');
  const [showQr, setShowQr] = useState('');
  const upi = settings.upi_id && settings.upi_payee_name ? { id: settings.upi_id, name: settings.upi_payee_name } : null;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [unpaid, paid] = await Promise.all([supabase.rpc('my_unpaid_appointments'), supabase.rpc('my_payments')]);
    const failed = unpaid.error ?? paid.error;
    if (failed) setError(friendlyError(failed));
    setDue((unpaid.data as UnpaidAppointment[]) ?? []);
    setReceipts((paid.data as Payment[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay(appointmentId: string) {
    setError('');
    setNotice('');
    setPaying(appointmentId);
    try {
      const result = await payOnline(appointmentId, { clinicName: settings.name, color: settings.primary_color, phone: profile?.phone });
      if (result === 'paid') setNotice(tr('Payment received. Thank you. Your receipt is below.', 'पेमेंट मिळाले. धन्यवाद. तुमची पावती खाली आहे.'));
      if (result === 'processing')
        setNotice(tr('Your payment is being confirmed. The receipt will appear here in a few minutes. Please do not pay again.', 'तुमचे पेमेंट तपासले जात आहे. काही मिनिटांत पावती इथे दिसेल. कृपया पुन्हा पैसे भरू नका.'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setPaying('');
  }

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>{tr('Payments', 'पेमेंट')}</h1>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && !error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}
      {due === null ? (
        <p role="status" className="mt-6 text-muted">{tr('Loading your payments…', 'तुमची पेमेंट लोड होत आहेत…')}</p>
      ) : (
        <>
          {due.length > 0 && (
            <section className="mt-6 max-w-3xl" aria-labelledby="due-title">
              <h2 id="due-title" className="font-display text-2xl">
                {tr('To pay', 'भरायचे बाकी')}
              </h2>
              <ul className="mt-3 space-y-3">
                {due.map((a) => (
                  <li key={a.appointment_id} className={card}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-ink">
                        {a.service_name}, {formatInr(a.price_inr)}
                      </p>
                      <p className="text-[0.95rem] text-muted">
                        {formatDate(dayOf(a.starts_at, tz))}, {timeOf(a.starts_at, tz)}, {a.doctor_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      {settings.online_payments && (
                        <button className={btnPrimary} disabled={paying !== ''} onClick={() => void pay(a.appointment_id)}>
                          {paying === a.appointment_id ? tr('Opening payment…', 'पेमेंट उघडत आहे…') : tr(`Pay ${formatInr(a.price_inr)} online`, `${formatInr(a.price_inr)} ऑनलाइन भरा`)}
                        </button>
                      )}
                      {upi && (
                        <button className={btnOutline} aria-expanded={showQr === a.appointment_id} onClick={() => setShowQr(showQr === a.appointment_id ? '' : a.appointment_id)}>
                          {showQr === a.appointment_id ? tr('Hide the QR code', 'QR कोड लपवा') : tr('Pay by UPI', 'UPI ने भरा')}
                        </button>
                      )}
                      {!settings.online_payments && !upi && <p className="font-semibold text-muted">{tr('Pay at the clinic', 'क्लिनिकमध्ये भरा')}</p>}
                    </div>
                    </div>
                    {upi && showQr === a.appointment_id && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-[18rem_1fr] sm:items-start">
                        <UpiQr upiId={upi.id} payeeName={upi.name} amountInr={a.price_inr} note={`${profile?.full_name ?? ''} ${a.service_name}`.trim()} />
                        <div className="space-y-2 text-ink">
                          <p className="font-semibold">{tr('After paying', 'पैसे भरल्यानंतर')}</p>
                          <p>
                            {tr(
                              'Keep the payment message from your UPI app and show it at the reception when you come. The clinic checks that the money has arrived and gives you a receipt. It then appears below.',
                              'तुमच्या UPI ॲपमधील पेमेंटचा मेसेज जपून ठेवा आणि क्लिनिकमध्ये आल्यावर रिसेप्शनला दाखवा. पैसे पोहोचले आहेत हे क्लिनिक तपासेल आणि पावती देईल. ती नंतर खाली दिसेल.',
                            )}
                          </p>
                          <p className="text-[0.95rem] text-muted">
                            {tr('Pay only once. If you are not sure whether it went through, check your UPI app or ask the clinic before paying again.', 'एकदाच भरा. पेमेंट झाले की नाही याबद्दल शंका असल्यास, पुन्हा भरण्यापूर्वी तुमचे UPI ॲप तपासा किंवा क्लिनिकला विचारा.')}
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.95rem] text-muted">
                {settings.online_payments
                  ? tr(
                      "You can also pay at the clinic by cash, UPI or card. Card and UPI details are entered on the payment company's secure page, not in this app.",
                      'तुम्ही क्लिनिकमध्ये रोख, UPI किंवा कार्डनेही भरू शकता. कार्ड आणि UPI ची माहिती पेमेंट कंपनीच्या सुरक्षित पानावर टाकली जाते, या ॲपमध्ये नाही.',
                    )
                  : tr('Pay at the clinic by cash, UPI or card when you come for your appointment.', 'अपॉइंटमेंटला याल तेव्हा क्लिनिकमध्ये रोख, UPI किंवा कार्डने भरा.')}
              </p>
            </section>
          )}

          <section className="mt-10 max-w-3xl" aria-labelledby="receipts-title">
            <h2 id="receipts-title" className="font-display text-2xl">
              {tr('Receipts', 'पावत्या')}
            </h2>
            {receipts.length === 0 ? (
              <p className="mt-3 text-muted">{tr('You have no receipts yet. A receipt appears here as soon as a payment is recorded.', 'अजून कोणतीही पावती नाही. पेमेंट नोंदवताच पावती इथे दिसेल.')}</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {receipts.map((r) => (
                  <li key={r.id}>
                    <ReceiptSheet payment={r} patientName={profile?.full_name ?? ''} settings={settings} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PortalShell>
  );
}
