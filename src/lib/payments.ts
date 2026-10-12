import { friendlyError } from './auth';
import { supabase } from './supabase';
import { tr } from './i18n';

export type PaymentStatus = 'paid' | 'refunded';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'online';

const METHOD_TEXT: Record<PaymentMethod, [string, string]> = { cash: ['Cash', 'रोख'], upi: ['UPI', 'UPI'], card: ['Card', 'कार्ड'], online: ['Online', 'ऑनलाइन'] };
/** Payment method names in the language chosen. */
export const METHOD_LABEL = new Proxy({} as Record<PaymentMethod, string>, {
  get: (_, key: string) => (METHOD_TEXT[key as PaymentMethod] ? tr(...METHOD_TEXT[key as PaymentMethod]) : undefined),
});
/** The ways to pay at the desk. "Online" is only ever set by the payment service. */
export const DESK_METHODS: PaymentMethod[] = ['cash', 'upi', 'card'];

/** One payment as the administrator sees it. */
export interface Payment {
  id: string;
  receipt_no: string;
  paid_at: string;
  /** The day it was paid, in the clinic's timezone */
  paid_on?: string;
  patient_name?: string;
  patient_phone?: string | null;
  amount_inr: number;
  method: PaymentMethod;
  status: PaymentStatus;
  description: string;
  doctor_name: string | null;
  appointment_id?: string | null;
  recorded_by_name?: string | null;
  refunded_at: string | null;
  refund_reason?: string | null;
  /** UPI reference number (UTR), when the desk noted it */
  upi_ref?: string | null;
}

/** One appointment on the billing list of a day. */
export interface Billable {
  appointment_id: string;
  starts_at: string;
  patient_id: string;
  patient_name: string;
  doctor_name: string;
  service_name: string;
  price_inr: number;
  status: string;
  payment_id: string | null;
  receipt_no: string | null;
  paid_inr: number | null;
}

export interface UnpaidAppointment {
  appointment_id: string;
  starts_at: string;
  doctor_name: string;
  service_name: string;
  price_inr: number;
}

/** Money received and refunded in a list of payments, overall and by method. */
export function summarise(rows: Payment[]) {
  const paid = rows.filter((r) => r.status === 'paid');
  const refunded = rows.filter((r) => r.status === 'refunded');
  const sum = (list: Payment[]) => list.reduce((total, r) => total + r.amount_inr, 0);
  const byMethod = (['cash', 'upi', 'card', 'online'] as PaymentMethod[])
    .map((m) => ({ method: m, count: paid.filter((r) => r.method === m).length, total: sum(paid.filter((r) => r.method === m)) }))
    .filter((m) => m.count > 0);
  const days = [...new Set(paid.map((r) => r.paid_on ?? ''))].sort();
  const byDay = days.map((day) => ({ day, count: paid.filter((r) => r.paid_on === day).length, total: sum(paid.filter((r) => r.paid_on === day)) }));
  return { received: sum(paid), receivedCount: paid.length, refunded: sum(refunded), refundedCount: refunded.length, byMethod, byDay };
}

/** A spreadsheet file (CSV) of payments, for the clinic's accountant. */
export function toCsv(rows: Payment[]): string {
  const cell = (v: unknown) => {
    let text = String(v ?? '');
    // A cell starting with = + - @ could be run as a formula by a spreadsheet: make it plain text.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const head = ['Receipt no', 'Date', 'Patient', 'For', 'Doctor', 'Method', 'Amount (Rs)', 'UPI reference', 'Status', 'Refund reason'];
  // The UPI reference gets a "UTR" label so Excel keeps all 12 digits instead of rounding it as a number.
  const lines = rows.map((r) =>
    [r.receipt_no, r.paid_on, r.patient_name, r.description, r.doctor_name, METHOD_LABEL[r.method], r.amount_inr, r.upi_ref ? `UTR ${r.upi_ref}` : '', r.status === 'paid' ? 'Paid' : 'Refunded', r.refund_reason].map(cell).join(','),
  );
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

/** Calls the clinic's payment server function and returns its answer, or throws a readable message. */
async function callServer<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('razorpay', { body });
  if (error) {
    let message = '';
    try {
      message = (await (error as { context?: Response }).context?.json())?.message ?? '';
    } catch {
      message = '';
    }
    throw new Error(message ? friendlyError({ message }) : tr('Online payment is not available right now. Please pay at the clinic.', 'ऑनलाइन पेमेंट सध्या उपलब्ध नाही. कृपया क्लिनिकमध्ये भरा.'));
  }
  return data as T;
}

let checkoutScript: Promise<void> | null = null;
/** Loads Razorpay's payment window the first time it is needed. */
function loadCheckout(): Promise<void> {
  checkoutScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScript = null;
      reject(new Error(tr('The payment window could not be loaded. Check your internet connection and try again.', 'पेमेंटची विंडो उघडली नाही. इंटरनेट तपासा आणि पुन्हा प्रयत्न करा.')));
    };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

interface CheckoutAnswer {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Pays for one appointment online. The amount is set by the database, the card or UPI
 * details are typed into Razorpay's own window (they never touch this app), and the
 * payment counts only after the clinic's server has checked it with Razorpay.
 * Resolves to 'paid', 'processing' (money taken, confirmation on its way) or 'closed' (window shut).
 */
export async function payOnline(appointmentId: string, opts: { clinicName: string; color: string; phone?: string | null }): Promise<'paid' | 'processing' | 'closed'> {
  const order = await callServer<{ key_id: string; order_id: string; amount_paise: number; description: string }>({ action: 'create', appointment_id: appointmentId });
  await loadCheckout();
  const answer = await new Promise<CheckoutAnswer | null>((resolve) => {
    const Razorpay = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay;
    new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: 'INR',
      name: opts.clinicName,
      description: order.description,
      prefill: opts.phone ? { contact: `+${opts.phone}` } : undefined,
      theme: { color: opts.color },
      handler: (response: CheckoutAnswer) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    }).open();
  });
  if (!answer) return 'closed';
  const result = await callServer<{ status: 'paid' | 'processing' }>({ action: 'verify', ...answer });
  return result.status;
}
