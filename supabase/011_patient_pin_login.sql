-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Patient sign-in with patient number and PIN
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 010. Safe to run more than once.
--
-- Built for a rural clinic: no SMS, no email, no Google account, no cost.
--   * Every patient gets a short PATIENT NUMBER (1001, 1002 ...), written on
--     their registration slip, like a hospital OPD card number.
--   * At the desk the administrator hands over a one-time SETUP CODE. The
--     patient uses it once to choose a 6-digit PIN, like an ATM PIN.
--   * After that: patient number + PIN. Their phone stays signed in.
--   * Forgotten PIN: the desk gives a new setup code.
-- Because the patient number, not the mobile number, is the login, family
-- members who share one phone each have their own number and PIN.
--
-- Security
--   * PINs and setup codes are stored only as one-way scrambles (bcrypt).
--     Nobody, including the clinic, can read a patient's PIN.
--   * 5 wrong tries lock the account for 30 minutes, so a PIN cannot be guessed.
--   * A setup code works once and expires after 7 days.
--   * The sign-in check runs only inside the clinic's server function.
--   * Issuing setup codes is admin-only and recorded in the access log.
-- =====================================================================

-- ---------- 1. Patient numbers -----------------------------------------
create sequence if not exists public.patient_no_seq start 1001;
alter table public.patients add column if not exists patient_no integer unique;
alter table public.patients alter column patient_no set default nextval('public.patient_no_seq');
update public.patients set patient_no = nextval('public.patient_no_seq') where patient_no is null;
alter table public.patients alter column patient_no set not null;

alter table public.clinic_settings add column if not exists sms_login boolean not null default false;  -- SMS codes off unless switched on

-- ---------- 2. PIN store (reachable only by the server function) -------------
create table if not exists public.patient_logins (
  patient_id        uuid primary key references public.profiles (user_id) on delete cascade,
  pin_hash          text,                       -- bcrypt of the PIN; null until the patient sets one
  pin_set_at        timestamptz,
  setup_code_hash   text,                       -- bcrypt of the one-time setup code
  setup_expires_at  timestamptz,
  failed_count      integer not null default 0,
  locked_until      timestamptz,
  last_login_at     timestamptz
);
alter table public.patient_logins enable row level security;
revoke all on public.patient_logins from anon, authenticated;

-- ---------- 3. Accounts made by the desk ----------------------------------
-- The desk's server function creates the login with a hidden address and a
-- marker that only server code can set (app metadata). Those accounts become
-- patients. Anything else keeps the old rules: a phone sign-up is a patient,
-- an email sign-up needs a staff invitation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invites%rowtype;
begin
  if coalesce(new.raw_app_meta_data ->> 'desk_patient', '') = 'true' then
    insert into public.profiles (user_id, role, phone)
    values (new.id, 'patient', nullif(new.raw_app_meta_data ->> 'contact_phone', ''));
    insert into public.patients (profile_id) values (new.id);
    return new;
  end if;

  if coalesce(new.email, '') = '' and coalesce(new.phone, '') <> '' then
    -- Mobile number sign-in by SMS (only if the clinic switches SMS on): always a patient.
    insert into public.profiles (user_id, role, phone) values (new.id, 'patient', new.phone);
    insert into public.patients (profile_id) values (new.id);
    return new;
  end if;

  if coalesce(new.email, '') <> '' then
    -- Email sign-up: allowed only with an unused invitation from an admin.
    select * into inv from public.staff_invites
     where email = lower(new.email) and accepted_at is null
       for update;
    if not found then
      raise exception 'EMAIL_NOT_INVITED: this email has not been invited by the clinic';
    end if;
    insert into public.profiles (user_id, role, full_name, email)
    values (new.id, inv.role, inv.full_name, lower(new.email));
    update public.staff_invites set accepted_at = now(), accepted_by = new.id where email = inv.email;
    if inv.role = 'doctor' and inv.doctor_id is not null then
      update public.doctors set profile_id = new.id where id = inv.doctor_id;
    end if;
    return new;
  end if;

  raise exception 'SIGNUP_NOT_ALLOWED: a mobile number or an invited email is required';
end $$;

-- ---------- 4. Setup codes -------------------------------------------------
-- A random 6-digit code. Internal helper.
create or replace function public.new_setup_code(p_patient_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
begin
  insert into public.patient_logins (patient_id, setup_code_hash, setup_expires_at, failed_count, locked_until)
  values (p_patient_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), now() + interval '7 days', 0, null)
  on conflict (patient_id) do update
     set setup_code_hash = excluded.setup_code_hash, setup_expires_at = excluded.setup_expires_at,
         failed_count = 0, locked_until = null;
  return v_code;
end $$;

-- Admin at the desk: a new setup code for a patient (first time, or a forgotten PIN).
-- The old PIN keeps working until the patient uses the new code.
create or replace function public.issue_setup_code(p_patient_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can give a setup code';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_patient_id and role = 'patient' and is_active) then
    raise exception 'NO_PATIENT: choose an active patient';
  end if;
  v_code := public.new_setup_code(p_patient_id);
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (auth.uid(), 'admin', 'create', 'patient_logins', p_patient_id::text, p_patient_id);
  return jsonb_build_object('setup_code', v_code,
                            'patient_no', (select patient_no from public.patients where profile_id = p_patient_id),
                            'expires_at', now() + interval '7 days');
end $$;

-- ---------- 5. Server-only steps of sign-in --------------------------------
-- Every wrong try is also noted here (time only), for a clinic-wide brake:
-- if someone tries many numbers with guessed PINs, all PIN sign-ins pause briefly.
create table if not exists public.login_failure_log (at timestamptz not null default now());
create index if not exists login_failure_log_at on public.login_failure_log (at);
alter table public.login_failure_log enable row level security;
revoke all on public.login_failure_log from anon, authenticated;

create or replace function public.login_brake_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) >= 40 from public.login_failure_log where at > now() - interval '15 minutes'
$$;

-- Shared by both checks: count a wrong try, lock after 5.
create or replace function public.login_failed(p_patient_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.login_failure_log default values;
  delete from public.login_failure_log where at < now() - interval '1 day';
  update public.patient_logins
     set failed_count = failed_count + 1,
         locked_until = case when failed_count + 1 >= 5 then now() + interval '30 minutes' else locked_until end
   where patient_id = p_patient_id
  returning failed_count into v_count;
  if v_count >= 5 then
    return 'LOCKED: too many wrong tries. Try again after 30 minutes, or ask the clinic for a new setup code';
  end if;
  return 'WRONG_PIN: the patient number or PIN is not right. ' || (5 - v_count) || ' tries left';
end $$;

-- These two checks never raise an error for a wrong PIN or code: an error would
-- undo the try counter along with everything else. They return an answer:
--   {"ok": true, "user_id": "..."}   or   {"ok": false, "message": "CODE: text"}

-- Step A, first time or forgotten PIN: patient number + setup code + new PIN.
drop function if exists public.patient_set_pin(integer, text, text);
create or replace function public.patient_set_pin(p_patient_no integer, p_setup_code text, p_new_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  l    public.patient_logins%rowtype;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_PIN: the PIN must be exactly 6 digits');
  end if;
  if p_new_pin ~ '^(.)\1{5}$' or p_new_pin in ('123456', '234567', '345678', '456789', '012345', '654321', '543210', '987654', '876543', '765432') then
    return jsonb_build_object('ok', false, 'message', 'WEAK_PIN: that PIN is too easy to guess. Choose six digits that are not all the same or in a row');
  end if;
  if public.login_brake_on() then
    return jsonb_build_object('ok', false, 'message', 'BUSY: too many wrong sign-in tries on this website just now. Please try again in 15 minutes');
  end if;
  select t.profile_id into v_id
    from public.patients t join public.profiles p on p.user_id = t.profile_id
   where t.patient_no = p_patient_no and p.is_active;
  select * into l from public.patient_logins where patient_id = v_id for update;
  if v_id is null or not found or l.setup_code_hash is null then
    return jsonb_build_object('ok', false, 'message', 'WRONG_CODE: the patient number or setup code is not right. Check the slip from the clinic');
  end if;
  if l.locked_until is not null and l.locked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'LOCKED: too many wrong tries. Try again after 30 minutes, or ask the clinic for a new setup code');
  end if;
  if l.setup_expires_at < now() then
    return jsonb_build_object('ok', false, 'message', 'CODE_EXPIRED: this setup code has expired. Ask the clinic for a new one');
  end if;
  if extensions.crypt(coalesce(p_setup_code, ''), l.setup_code_hash) <> l.setup_code_hash then
    return jsonb_build_object('ok', false, 'message',
      replace(public.login_failed(v_id), 'WRONG_PIN: the patient number or PIN', 'WRONG_CODE: the patient number or setup code'));
  end if;
  update public.patient_logins
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), pin_set_at = now(),
         setup_code_hash = null, setup_expires_at = null, failed_count = 0, locked_until = null, last_login_at = now()
   where patient_id = v_id;
  return jsonb_build_object('ok', true, 'user_id', v_id);
end $$;

-- Step B, every day: patient number + PIN.
drop function if exists public.patient_check_pin(integer, text);
create or replace function public.patient_check_pin(p_patient_no integer, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  l    public.patient_logins%rowtype;
begin
  if public.login_brake_on() then
    return jsonb_build_object('ok', false, 'message', 'BUSY: too many wrong sign-in tries on this website just now. Please try again in 15 minutes');
  end if;
  select t.profile_id into v_id
    from public.patients t join public.profiles p on p.user_id = t.profile_id
   where t.patient_no = p_patient_no and p.is_active;
  select * into l from public.patient_logins where patient_id = v_id for update;
  if v_id is null or not found or l.pin_hash is null then
    -- Same message whether the number exists or not, so numbers cannot be probed.
    return jsonb_build_object('ok', false, 'message', 'WRONG_PIN: the patient number or PIN is not right. If this is your first time, use the setup code from the clinic');
  end if;
  if l.locked_until is not null and l.locked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'LOCKED: too many wrong tries. Try again after 30 minutes, or ask the clinic for a new setup code');
  end if;
  if extensions.crypt(coalesce(p_pin, ''), l.pin_hash) <> l.pin_hash then
    return jsonb_build_object('ok', false, 'message', public.login_failed(v_id));
  end if;
  update public.patient_logins set failed_count = 0, locked_until = null, last_login_at = now() where patient_id = v_id;
  return jsonb_build_object('ok', true, 'user_id', v_id);
end $$;

-- ---------- 6. Desk registration, now with patient number and setup code ----
-- (A new name, so that running file 010 again later does not undo this.)
create or replace function public.desk_register_patient_v2(
  p_user_id uuid, p_full_name text, p_date_of_birth date, p_gender text, p_admin_id uuid, p_consent boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text := btrim(coalesce(p_full_name, ''));
  v_gender text := nullif(btrim(coalesce(p_gender, '')), '');
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and role = 'admin' and is_active) then
    raise exception 'NOT_ALLOWED: only an administrator can register a patient';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'INVALID_NAME: enter the patient''s full name (2 to 80 characters)';
  end if;
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED: confirm that the patient has agreed to the privacy notice';
  end if;
  if v_gender is not null and v_gender not in ('female', 'male', 'other', 'prefer_not_to_say') then
    raise exception 'INVALID_GENDER: choose one of the listed options';
  end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    raise exception 'INVALID_DATE: the date of birth cannot be in the future';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id and role = 'patient') then
    raise exception 'NO_PATIENT: the patient account was not created';
  end if;
  if exists (select 1 from public.profiles where user_id = p_user_id and coalesce(full_name, '') <> '') then
    raise exception 'ALREADY_REGISTERED: this patient is already registered';
  end if;

  update public.profiles set full_name = v_name where user_id = p_user_id;
  update public.patients
     set date_of_birth = p_date_of_birth, gender = v_gender,
         privacy_consent_at = now(), registered_by = p_admin_id, updated_at = now()
   where profile_id = p_user_id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (p_admin_id, 'admin', 'create', 'patients', p_user_id::text, p_user_id);
  return jsonb_build_object('patient_no', (select patient_no from public.patients where profile_id = p_user_id),
                            'setup_code', public.new_setup_code(p_user_id));
end $$;

-- ---------- 7. Admin list: patient numbers and PIN status ---------------------
create or replace function public.patient_login_status()
returns table (patient_id uuid, patient_no integer, has_pin boolean, code_waiting boolean, locked boolean, last_login_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can see this';
  end if;
  return query
    select t.profile_id, t.patient_no, l.pin_hash is not null,
           l.setup_code_hash is not null and l.setup_expires_at > now(),
           coalesce(l.locked_until > now(), false), l.last_login_at
      from public.patients t left join public.patient_logins l on l.patient_id = t.profile_id;
end $$;

-- ---------- 8. Permissions ---------------------------------------------------
revoke execute on function public.new_setup_code(uuid) from public, anon, authenticated;
revoke execute on function public.login_failed(uuid) from public, anon, authenticated;
revoke execute on function public.login_brake_on() from public, anon, authenticated;
revoke execute on function public.issue_setup_code(uuid) from public, anon;
grant execute on function public.issue_setup_code(uuid) to authenticated;
revoke execute on function public.patient_login_status() from public, anon;
grant execute on function public.patient_login_status() to authenticated;
revoke execute on function public.patient_set_pin(integer, text, text) from public, anon, authenticated;
grant execute on function public.patient_set_pin(integer, text, text) to service_role;
revoke execute on function public.patient_check_pin(integer, text) from public, anon, authenticated;
grant execute on function public.patient_check_pin(integer, text) to service_role;
revoke execute on function public.desk_register_patient_v2(uuid, text, date, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.desk_register_patient_v2(uuid, text, date, text, uuid, boolean) to service_role;
revoke all on sequence public.patient_no_seq from anon, authenticated;
