// =====================================================================
// Dr. Sonawane Clinic App  ·  Patient sign-in with patient number and PIN
//
// Where this goes: Supabase dashboard > Edge Functions > Deploy a new function
//   > Via Editor. Name it exactly:  patient-login   and paste this whole file.
//   Switch OFF "Verify JWT" for this function: the patient is not signed in
//   yet when they use it. The function checks the PIN itself.
//   No extra secrets are needed.
//
// What it does
//   "pin"    patient number + 6-digit PIN  ->  signed in
//   "setup"  patient number + setup code from the desk + new PIN  ->  PIN saved, signed in
//   The database checks the PIN (stored only as a one-way scramble), counts
//   wrong tries and locks after 5. Only when it says yes does this function
//   open a sign-in session for that patient.
// =====================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** A long random password that is used once and never stored or shown. */
function throwawayPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') + 'Pq7!';
}

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { message: 'METHOD: use POST' });
  const apikey = req.headers.get('apikey') ?? env.SUPABASE_ANON_KEY ?? '';
  const service = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const failed = (message = 'FAILED: sign-in did not work. Please try again') => reply(400, { message });

  try {
    const body = await req.json().catch(() => ({}));
    const patientNo = Number(String(body.patient_no ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(patientNo) || patientNo < 1 || patientNo > 99999999) {
      return reply(400, { message: 'INVALID_NUMBER: enter the patient number from your clinic slip' });
    }

    // 1. Ask the database. It answers {"ok": true, "user_id"} or {"ok": false, "message"}.
    let answer: { ok: boolean; user_id?: string; message?: string };
    if (body.action === 'pin') {
      answer = await rpc('patient_check_pin', { p_patient_no: patientNo, p_pin: String(body.pin ?? '') });
    } else if (body.action === 'setup') {
      answer = await rpc('patient_set_pin', { p_patient_no: patientNo, p_setup_code: String(body.setup_code ?? ''), p_new_pin: String(body.new_pin ?? '') });
    } else {
      return reply(400, { message: 'INVALID: unknown action' });
    }
    if (!answer || answer.ok !== true || !answer.user_id) return reply(400, { message: answer?.message ?? 'FAILED: sign-in did not work. Please try again' });

    // 2. The PIN is right: open a session. A fresh one-time password is set on the
    //    account and used immediately; nobody ever sees it.
    const userRes = await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users/${answer.user_id}`, { headers: service });
    if (!userRes.ok) return failed();
    const user = await userRes.json();
    const password = throwawayPassword();
    const set = await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users/${answer.user_id}`, {
      method: 'PUT', headers: service, body: JSON.stringify({ password }),
    });
    if (!set.ok) return failed();
    const login = user.email ? { email: user.email, password } : { phone: user.phone, password };
    const tokenRes = await fetcher(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify(login),
    });
    if (!tokenRes.ok) return failed();
    const session = await tokenRes.json();
    return reply(200, { access_token: session.access_token, refresh_token: session.refresh_token });
  } catch {
    return failed();
  }

  async function rpc(name: string, args: unknown) {
    const res = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: service, body: JSON.stringify(args) });
    if (!res.ok) throw new Error('DATABASE');
    return res.json();
  }
}

declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } } | undefined;
if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handle(req, {
      SUPABASE_URL: Deno!.env.get('SUPABASE_URL') ?? '',
      SUPABASE_ANON_KEY: Deno!.env.get('SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: Deno!.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    }),
  );
}
