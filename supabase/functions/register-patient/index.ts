// =====================================================================
// Dr. Sonawane Clinic App  ·  Front-desk registration: server function
//
// Where this goes: Supabase dashboard > Edge Functions > Deploy a new function
//   > Via Editor. Name it exactly:  register-patient   and paste this whole file.
//   Leave "Verify JWT" ON for this function. No extra secrets are needed.
//
// What it does
//   An administrator at the desk enters a walk-in patient's name and, if they
//   have one, a contact mobile number. This function checks that the person
//   asking really is an active administrator, creates the patient's account,
//   and returns the patient's number and a one-time setup code. The patient
//   uses those once to choose a 6-digit PIN (see the patient-login function).
//   Family members may share one contact number; each gets their own patient number.
//
// Why a server function: creating an account needs the project's secret key.
// That key lives only here on the server, never in the app.
// =====================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/** Login addresses for desk-registered patients end with this. No email is ever sent to them. */
const HIDDEN_DOMAIN = 'patients.dr-sonawane-clinic.vercel.app';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { message: 'METHOD: use POST' });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? env.SUPABASE_ANON_KEY ?? '';
  if (!token || !apikey) return reply(401, { message: 'NOT_ALLOWED: please sign in' });
  const service = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

  try {
    // 1. Who is asking? Supabase itself tells us, from their sign-in.
    const who = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } });
    if (!who.ok) return reply(401, { message: 'NOT_ALLOWED: please sign in again' });
    const adminId = (await who.json()).id as string;
    // 2. Are they an active administrator? Asked of the database, as them.
    const check = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: 'POST', headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!check.ok || (await check.json()) !== true) return reply(403, { message: 'NOT_ALLOWED: only an administrator can register a patient' });

    // 3. Check what was typed.
    const body = await req.json().catch(() => ({}));
    const name = String(body.full_name ?? '').trim();
    const mobile = String(body.mobile ?? '').replace(/\D/g, '');
    if (name.length < 2 || name.length > 80) return reply(400, { message: 'INVALID_NAME: enter the patient\'s full name (2 to 80 characters)' });
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return reply(400, { message: 'INVALID_MOBILE: enter a 10-digit Indian mobile number, or leave it empty' });
    if (body.consent !== true) return reply(400, { message: 'CONSENT_REQUIRED: confirm that the patient has agreed to the privacy notice' });

    // 4. Ask the database for a one-time pass (only this server can), then create
    //    the login with it. The login has a hidden address that never receives
    //    email and a random password nobody knows. The database checks the pass
    //    and makes the login a patient registered at the desk.
    const passRes = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/desk_signup_pass`, {
      method: 'POST', headers: service, body: JSON.stringify({ p_contact_phone: mobile ? `91${mobile}` : null }),
    });
    if (!passRes.ok) {
      const why = (await passRes.text().catch(() => '')).slice(0, 200);
      console.error('register-patient: getting a pass failed:', passRes.status, why);
      return reply(400, { message: `FAILED: the patient could not be registered. The database said: ${why || `status ${passRes.status}`}. Has file 011 been run?` });
    }
    const pass = (await passRes.json()) as string;
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const tag = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
    const password = tag + [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('') + 'Pq7!';
    const made = await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: service,
      body: JSON.stringify({
        email: `patient-${tag}@${HIDDEN_DOMAIN}`, password, email_confirm: true,
        user_metadata: { desk_pass: pass },
      }),
    });
    if (!made.ok) {
      // Say why, so the administrator (and the Logs tab) can see the cause.
      const why = await made.json().catch(() => ({}));
      const reason = String(why.msg ?? why.message ?? why.error_description ?? why.error ?? `status ${made.status}`).slice(0, 200);
      console.error('register-patient: creating the login failed:', made.status, reason);
      return reply(400, { message: `FAILED: the patient could not be registered. The login system said: ${reason}` });
    }
    const userId = (await made.json()).id as string;

    // 6. Save the name and the consent.
    const saved = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/desk_register_patient_v2`, {
      method: 'POST', headers: service,
      body: JSON.stringify({ p_user_id: userId, p_full_name: name, p_date_of_birth: body.date_of_birth || null, p_gender: body.gender || null, p_admin_id: adminId, p_consent: true }),
    });
    if (!saved.ok) {
      // Do not leave a nameless account behind.
      await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: service });
      const message = String((await saved.json().catch(() => ({}))).message ?? '');
      console.error('register-patient: saving the patient failed:', saved.status, message.slice(0, 200));
      return reply(400, {
        message: /^[A-Z_]+: /.test(message) ? message : `FAILED: the patient could not be registered. The database said: ${message.slice(0, 200) || `status ${saved.status}`}`,
      });
    }
    const result = await saved.json();
    return reply(200, { user_id: userId, patient_no: result.patient_no, setup_code: result.setup_code });
  } catch (e) {
    console.error('register-patient: unexpected error:', String(e).slice(0, 200));
    return reply(400, { message: 'FAILED: the patient could not be registered. Please try again' });
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
