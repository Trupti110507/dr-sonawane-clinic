-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Front-desk registration of patients
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 009. Safe to run more than once.
--
-- Until now a patient existed only after signing in on their own phone.
-- This lets an administrator register a walk-in patient at the desk, with
-- the patient's name and mobile number. The patient can sign in later with
-- that same number and will find their appointments, receipts and so on.
--
-- The account itself is created by the clinic's server function
-- "register-patient" (it needs a key that must never be in the app).
-- This file adds the one database step that function calls.
-- Rules
--   * Only the server function can call it, and the function first checks
--     that the person asking is an active administrator.
--   * The administrator must confirm that the patient agreed to the privacy
--     notice. Who registered the patient, and when, is kept and logged.
--   * The administrator enters contact details only. No medical information.
-- =====================================================================

alter table public.patients add column if not exists registered_by uuid references public.profiles (user_id) on delete set null;
-- registered_by is empty for patients who signed up themselves.

create or replace function public.desk_register_patient(
  p_user_id uuid, p_full_name text, p_date_of_birth date, p_gender text, p_admin_id uuid, p_consent boolean
) returns void
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
    raise exception 'ALREADY_REGISTERED: this mobile number is already registered';
  end if;

  update public.profiles set full_name = v_name where user_id = p_user_id;
  update public.patients
     set date_of_birth = p_date_of_birth, gender = v_gender,
         privacy_consent_at = now(), registered_by = p_admin_id, updated_at = now()
   where profile_id = p_user_id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (p_admin_id, 'admin', 'create', 'patients', p_user_id::text, p_user_id);
end $$;

revoke execute on function public.desk_register_patient(uuid, text, date, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.desk_register_patient(uuid, text, date, text, uuid, boolean) to service_role;
