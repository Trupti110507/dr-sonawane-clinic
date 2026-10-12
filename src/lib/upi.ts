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

/**
 * Reads the UPI ID and name from the text inside a clinic's printed UPI QR code.
 * Handles the usual "upi://pay?pa=...&pn=..." QR and the Bharat QR format used by some banks.
 * Returns null if the QR does not hold a UPI ID.
 */
export function parseUpiQr(text: string): { upiId: string; payeeName: string } | null {
  const raw = text.trim();
  if (/^upi:\/\//i.test(raw)) {
    const params = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
    const id = (params.get('pa') ?? '').trim().toLowerCase();
    if (!UPI_ID.test(id)) return null;
    return { upiId: id, payeeName: (params.get('pn') ?? '').trim().slice(0, 60) };
  }
  // Bharat QR: a chain of fields, each "two-digit tag, two-digit length, value".
  // Tags 26 to 51 hold payment accounts (the UPI ID is inside one of them); tag 59 is the name.
  const fields = tlv(raw);
  if (!fields) return null;
  let id = '';
  for (const [tag, value] of fields) {
    const n = Number(tag);
    if (n < 26 || n > 51) continue;
    for (const [, inner] of tlv(value) ?? []) {
      const candidate = inner.trim().toLowerCase();
      if (!id && UPI_ID.test(candidate)) id = candidate;
    }
  }
  if (!id) return null;
  const name = fields.find(([tag]) => tag === '59')?.[1] ?? '';
  return { upiId: id, payeeName: name.trim().slice(0, 60) };
}

/** Splits "tag, length, value" text into its fields, or returns null if it is not in that form. */
function tlv(text: string): [string, string][] | null {
  const out: [string, string][] = [];
  for (let i = 0; i < text.length; ) {
    const tag = text.slice(i, i + 2), len = text.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len) || i + 4 + Number(len) > text.length) return null;
    out.push([tag, text.slice(i + 4, i + 4 + Number(len))]);
    i += 4 + Number(len);
  }
  return out;
}

/** Finds and reads a QR code in a photo or screenshot. Returns its text, or null if none is found. */
export async function readQrFromImage(file: File): Promise<string | null> {
  const jsQR = (await import('jsqr')).default;
  const bitmap = await createImageBitmap(file);
  try {
    // Try the picture at a few sizes: big phone photos read better when made smaller.
    for (const target of [1000, 1600, 600, 2400]) {
      const scale = Math.min(1, target / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (found?.data) return found.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
