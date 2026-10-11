// =====================================================================
// Dr. Sonawane Clinic App  ·  Front-desk registration: server function
//
// Where this goes: Supabase dashboard > Edge Functions > Deploy a new function
//   > Via Editor. Name it exactly:  register-patient   and paste this whole file.
//   Leave "Verify JWT" ON for this function. No extra secrets are needed.
//
// What it does
//   An administrator at the desk enters a walk-in patient's name and mobile
//   number. This function checks that the person asking really is an active
//   administrator, creates the patient's account for that mobile number, and
//   saves the name. The patient can later sign in with the same number.
//
// Why a server function: creating an account needs the project's secret key.
// That key lives only here on the server, never in the app.
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
    if (!/^[6-9]\d{9}$/.test(mobile)) return reply(400, { message: 'INVALID_MOBILE: enter a 10-digit Indian mobile number' });
    if (body.consent !== true) return reply(400, { message: 'CONSENT_REQUIRED: confirm that the patient has agreed to the privacy notice' });
    const phone = `91${mobile}`;

    // 4. Already a patient? Then there is nothing to create.
    const found = await fetcher(`${env.SUPABASE_URL}/rest/v1/profiles?select=user_id&phone=in.(${phone},%2B${phone})`, { headers: service });
    if (found.ok && ((await found.json()) as unknown[]).length > 0) {
      return reply(409, { message: 'ALREADY_REGISTERED: this mobile number is already registered. Find the patient in the list below' });
    }

    // 5. Create the account for that mobile number. No password and no code is set;
    //    the patient signs in later with an SMS code like everyone else.
    const made = await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: service, body: JSON.stringify({ phone: `+${phone}`, phone_confirm: true }),
    });
    if (!made.ok) {
      const text = JSON.stringify(await made.json().catch(() => ({}))).toLowerCase();
      if (text.includes('already') || text.includes('exists')) {
        return reply(409, { message: 'ALREADY_REGISTERED: this mobile number is already registered. Find the patient in the list below' });
      }
      return reply(400, { message: 'FAILED: the patient could not be registered. Please try again' });
    }
    const userId = (await made.json()).id as string;

    // 6. Save the name and the consent.
    const saved = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/desk_register_patient`, {
      method: 'POST', headers: service,
      body: JSON.stringify({ p_user_id: userId, p_full_name: name, p_date_of_birth: body.date_of_birth || null, p_gender: body.gender || null, p_admin_id: adminId, p_consent: true }),
    });
    if (!saved.ok) {
      // Do not leave a nameless account behind.
      await fetcher(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: service });
      const message = String((await saved.json().catch(() => ({}))).message ?? '');
      return reply(400, { message: /^[A-Z_]+: /.test(message) ? message : 'FAILED: the patient could not be registered. Please try again' });
    }
    return reply(200, { user_id: userId });
  } catch {
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
