import { useCallback, useEffect, useState } from 'react';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import ReceiptSheet from '../../components/ReceiptSheet';
import { dayOf, timeOf } from '../../lib/appointments';
import { friendlyError, useAuth } from '../../lib/auth';
import { formatDate, formatInr, type ClinicData } from '../../lib/clinic';
import { payOnline, type Payment, type UnpaidAppointment } from '../../lib/payments';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, pageTitle } from '../../lib/ui';

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
      if (result === 'paid') setNotice('Payment received. Thank you. Your receipt is below.');
      if (result === 'processing') setNotice('Your payment is being confirmed. The receipt will appear here in a few minutes. Please do not pay again.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setPaying('');
  }

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>Payments</h1>
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
        <p role="status" className="mt-6 text-muted">Loading your payments…</p>
      ) : (
        <>
          {due.length > 0 && (
            <section className="mt-6 max-w-3xl" aria-labelledby="due-title">
              <h2 id="due-title" className="font-display text-2xl">
                To pay
              </h2>
              <ul className="mt-3 space-y-3">
                {due.map((a) => (
                  <li key={a.appointment_id} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                    <div>
                      <p className="font-semibold text-ink">
                        {a.service_name}, {formatInr(a.price_inr)}
                      </p>
                      <p className="text-[0.95rem] text-muted">
                        {formatDate(dayOf(a.starts_at, tz))}, {timeOf(a.starts_at, tz)}, {a.doctor_name}
                      </p>
                    </div>
                    {settings.online_payments ? (
                      <button className={`${btnPrimary} shrink-0`} disabled={paying !== ''} onClick={() => void pay(a.appointment_id)}>
                        {paying === a.appointment_id ? 'Opening payment…' : `Pay ${formatInr(a.price_inr)} online`}
                      </button>
                    ) : (
                      <p className="shrink-0 font-semibold text-muted">Pay at the clinic</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.95rem] text-muted">
                {settings.online_payments
                  ? 'You can also pay at the clinic by cash, UPI or card. Card and UPI details are entered on the payment company\'s secure page, not in this app.'
                  : 'Pay at the clinic by cash, UPI or card when you come for your appointment.'}
              </p>
            </section>
          )}

          <section className="mt-10 max-w-3xl" aria-labelledby="receipts-title">
            <h2 id="receipts-title" className="font-display text-2xl">
              Receipts
            </h2>
            {receipts.length === 0 ? (
              <p className="mt-3 text-muted">You have no receipts yet. A receipt appears here as soon as a payment is recorded.</p>
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
