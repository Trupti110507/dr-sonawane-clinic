// =====================================================================
// Dr. Sonawane Clinic App  ·  Stage 8: the Razorpay server function
//
// Where this goes: Supabase dashboard > Edge Functions > Deploy a new function
//   > Via Editor. Name it exactly:  razorpay   and paste this whole file.
//   Switch OFF "Verify JWT" for this function (Razorpay's own messages
//   carry no login; this file checks every request itself).
//
// Secrets it needs (Edge Functions > Secrets). Never put these in the app:
//   RAZORPAY_KEY_ID          from the Razorpay dashboard
//   RAZORPAY_KEY_SECRET      from the Razorpay dashboard
//   RAZORPAY_WEBHOOK_SECRET  the secret you type when adding the webhook
//
// What it does
//   create   a signed-in patient asks to pay for their appointment. The
//            DATABASE decides the amount; this function opens a Razorpay order.
//   verify   after the patient pays, checks Razorpay's signature and asks
//            Razorpay directly whether the money was captured. Only then is
//            the payment marked paid and given a receipt number.
//   webhook  Razorpay tells the clinic about a captured payment, in case the
//            patient closed the browser before "verify" ran.
// =====================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** HMAC-SHA256 of a message, as lower-case hex. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings without stopping early, so timing gives nothing away. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Calls a database function. With a user's token it runs as that user; otherwise as the server. */
async function rpc(env: Env, fetcher: typeof fetch, name: string, args: unknown, user?: { token: string; apikey: string }) {
  const key = user ? user.apikey : env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${user ? user.token : env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.message) || 'DATABASE: the request was refused');
  return data;
}

async function razorpay(env: Env, fetcher: typeof fetch, path: string, body?: unknown) {
  const res = await fetcher(`https://api.razorpay.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('RAZORPAY: the payment service refused the request');
  return data;
}

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { message: 'METHOD: use POST' });
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return reply(503, { message: 'NOT_SET_UP: online payment is not set up yet. Please pay at the clinic' });
  }
  const raw = await req.text();

  try {
    // ---------- webhook: a message from Razorpay itself ----------
    const hookSignature = req.headers.get('x-razorpay-signature');
    if (hookSignature) {
      if (!env.RAZORPAY_WEBHOOK_SECRET) return reply(503, { message: 'NOT_SET_UP: webhook secret missing' });
      if (!sameText(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), hookSignature)) {
        return reply(401, { message: 'BAD_SIGNATURE: this message did not come from Razorpay' });
      }
      const event = JSON.parse(raw);
      const pay = event?.payload?.payment?.entity;
      if (event?.event === 'payment.captured' && pay?.order_id) {
        try {
          await rpc(env, fetcher, 'confirm_online_payment', { p_order_id: pay.order_id, p_razorpay_payment_id: pay.id, p_amount_paise: pay.amount });
        } catch (e) {
          // An order this app did not create is none of its business; anything else Razorpay should retry.
          if (!String((e as Error).message).startsWith('UNKNOWN_ORDER')) return reply(500, { message: 'RETRY' });
        }
      }
      return reply(200, { received: true });
    }

    // ---------- requests from the patient's browser ----------
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const apikey = req.headers.get('apikey') ?? env.SUPABASE_ANON_KEY ?? '';
    if (!token || !apikey) return reply(401, { message: 'NOT_ALLOWED: please sign in' });
    const body = raw ? JSON.parse(raw) : {};

    if (body.action === 'create') {
      if (typeof body.appointment_id !== 'string') return reply(400, { message: 'INVALID: appointment missing' });
      // Runs as the patient: the database checks it is their appointment and sets the amount.
      const started = await rpc(env, fetcher, 'start_online_payment', { p_appointment_id: body.appointment_id }, { token, apikey });
      const order = await razorpay(env, fetcher, 'orders', {
        amount: started.amount_inr * 100,           // Razorpay counts in paise
        currency: 'INR',
        receipt: started.payment_id,
        notes: { payment_id: started.payment_id },
      });
      await rpc(env, fetcher, 'attach_razorpay_order', { p_payment_id: started.payment_id, p_order_id: order.id });
      return reply(200, { key_id: env.RAZORPAY_KEY_ID, order_id: order.id, amount_paise: order.amount, description: started.description });
    }

    if (body.action === 'verify') {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
      if (![orderId, paymentId, signature].every((v) => typeof v === 'string' && v.length > 0 && v.length < 100)) {
        return reply(400, { message: 'INVALID: payment details missing' });
      }
      if (!sameText(await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature)) {
        return reply(400, { message: 'BAD_SIGNATURE: the payment could not be verified' });
      }
      // Ask Razorpay directly: the browser is never trusted about money.
      const pay = await razorpay(env, fetcher, `payments/${encodeURIComponent(paymentId)}`);
      if (pay.order_id !== orderId) return reply(400, { message: 'BAD_ORDER: the payment does not belong to this order' });
      if (pay.status !== 'captured') return reply(200, { status: 'processing' });
      const receiptNo = await rpc(env, fetcher, 'confirm_online_payment', { p_order_id: orderId, p_razorpay_payment_id: paymentId, p_amount_paise: pay.amount });
      return reply(200, { status: 'paid', receipt_no: receiptNo });
    }

    return reply(400, { message: 'INVALID: unknown action' });
  } catch (e) {
    const message = String((e as Error).message ?? e);
    // Database messages in the app's "CODE: text" form are safe to show; anything else is not.
    return reply(400, { message: /^[A-Z_]+: /.test(message) ? message : 'FAILED: the payment could not be completed. No receipt was issued' });
  }
}

// Start the function when running on Supabase (Deno). Tests import handle() instead.
declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } } | undefined;
if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handle(req, {
      SUPABASE_URL: Deno!.env.get('SUPABASE_URL') ?? '',
      SUPABASE_ANON_KEY: Deno!.env.get('SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: Deno!.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      RAZORPAY_KEY_ID: Deno!.env.get('RAZORPAY_KEY_ID') ?? '',
      RAZORPAY_KEY_SECRET: Deno!.env.get('RAZORPAY_KEY_SECRET') ?? '',
      RAZORPAY_WEBHOOK_SECRET: Deno!.env.get('RAZORPAY_WEBHOOK_SECRET'),
    }),
  );
}
