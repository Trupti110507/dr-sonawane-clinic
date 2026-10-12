/** A UPI ID looks like name@bank, for example drsonawane@okaxis. Same rule as the database. */
export const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/;

/** A UPI reference number (UTR): letters and digits only, usually 12 digits. */
export function cleanUpiRef(text: string): string {
  return text.replace(/\s/g, '').toUpperCase();
}
export const UPI_REF = /^[A-Z0-9]{6,35}$/;

/**
 * The standard UPI payment link. Every UPI app (PhonePe, Google Pay, Paytm, BHIM,
 * bank apps) understands it, from a QR code or, on a phone, as a tap.
 * The note is what the clinic sees beside the payment in its own UPI app.
 */
export function upiLink(opts: { upiId: string; payeeName: string; amountInr: number; note: string }): string {
  const note = opts.note.replace(/[^\p{L}\p{M}\p{N} .,/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  // The UPI ID is written as it is (it only holds letters, digits, . _ - and @): some UPI apps do not read "%40".
  return (
    `upi://pay?pa=${opts.upiId}&pn=${encodeURIComponent(opts.payeeName)}&am=${opts.amountInr.toFixed(2)}&cu=INR` +
    (note ? `&tn=${encodeURIComponent(note)}` : '')
  );
}

/** The QR code for a link, as a picture the page can show without any outside service. */
export async function qrPicture(text: string): Promise<string> {
  // Loaded only when a QR code is needed, so the rest of the app opens faster.
  const QRCode = (await import('qrcode')).default;
  const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** True on phones and tablets, where a tap can open the UPI app directly. */
export function isPhone(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
