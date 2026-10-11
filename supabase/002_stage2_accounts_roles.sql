-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 2: accounts and roles
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER 001_stage1_clinic_setup.sql. Safe to run more than once.
-- If you ever re-run file 001, run this file again straight after it.
--
-- What this file sets up
--   profiles        one row per login, holding the role (patient/doctor/admin)
--   patients        extra details for patient accounts
--   staff_invites   the only way a doctor or admin account can come to exist
-- Rules enforced by the database (not by the screens):
--   * Anyone signing in with a mobile number becomes a PATIENT. Always.
--   * An email sign-up is refused unless an admin invited that email.
--   * Nobody can change their own role or re-activate themselves.
--   * Patients read only their own rows. Admins read accounts, not medical data.
-- =====================================================================

-- ---------- 1. Role type ----------------------------------------------
do $$ begin
  create type public.user_role as enum ('patient', 'doctor', 'admin');
exception when duplicate_object then null;
end $$;

-- ---------- 2. Tables -------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'patient',
  full_name  text not null default '' check (char_length(full_name) <= 80),
  phone      text,
  email      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  profile_id              uuid primary key references public.profiles (user_id) on delete cascade,
  date_of_birth           date check (date_of_birth between date '1900-01-01' and current_date),
  gender                  text check (gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  address                 text check (char_length(address) <= 300),
  emergency_contact_name  text check (char_length(emergency_contact_name) <= 80),
  emergency_contact_phone text check (emergency_contact_phone ~ '^[6-9][0-9]{9}$'),
  privacy_consent_at      timestamptz,
  updated_at              timestamptz not null default now()
);

create table if not exists public.staff_invites (
  email       text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.user_role not null check (role in ('doctor', 'admin')),
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 80),
  doctor_id   uuid unique references public.doctors (id) on delete set null,  -- which listing this doctor is
  invited_by  uuid references public.profiles (user_id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (user_id) on delete set null
);

-- Link a doctor's public listing to their login.
alter table public.doctors
  add column if not exists profile_id uuid unique references public.profiles (user_id) on delete set null;

-- ---------- 3. Helper functions ---------------------------------------
-- The role of whoever is making the request, or NULL if they are signed
-- out, deactivated, or a staff member whose email is not yet confirmed.
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role
    from public.profiles p
    join auth.users u on u.id = p.user_id
   where p.user_id = (select auth.uid())
     and p.is_active
     and (p.role = 'patient' or u.email_confirmed_at is not null)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- ---------- 4. New login => profile (runs inside Supabase Auth) --------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invites%rowtype;
begin
  if coalesce(new.email, '') = '' and coalesce(new.phone, '') <> '' then
    -- Mobile number sign-in: always a patient.
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

    update public.staff_invites
       set accepted_at = now(), accepted_by = new.id
     where email = inv.email;

    if inv.role = 'doctor' and inv.doctor_id is not null then
      update public.doctors set profile_id = new.id where id = inv.doctor_id;
    end if;
    return new;
  end if;

  raise exception 'SIGNUP_NOT_ALLOWED: a mobile number or an invited email is required';
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 5. Actions (the ONLY ways to change account data) ----------
-- 5a. Patient finishes registration: name + consent to the privacy notice.
create or replace function public.complete_patient_registration(p_full_name text, p_consent boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_full_name, ''));
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'INVALID_NAME: enter your full name (2 to 80 characters)';
  end if;
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED: please accept the privacy notice to continue';
  end if;
  update public.profiles set full_name = v_name where user_id = auth.uid();
  update public.patients
     set privacy_consent_at = coalesce(privacy_consent_at, now()), updated_at = now()
   where profile_id = auth.uid();
end $$;

-- 5b. Patient edits their own profile.
create or replace function public.update_my_patient_profile(
  p_full_name text,
  p_date_of_birth date,
  p_gender text,
  p_address text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_full_name, ''));
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'INVALID_NAME: enter your full name (2 to 80 characters)';
  end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    raise exception 'INVALID_DOB: enter a valid date of birth';
  end if;
  if nullif(btrim(coalesce(p_emergency_contact_phone, '')), '') is not null
     and btrim(p_emergency_contact_phone) !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE: enter a 10-digit mobile number';
  end if;
  update public.profiles set full_name = v_name where user_id = auth.uid();
  update public.patients set
         date_of_birth           = p_date_of_birth,
         gender                  = nullif(p_gender, ''),
         address                 = nullif(btrim(coalesce(p_address, '')), ''),
         emergency_contact_name  = nullif(btrim(coalesce(p_emergency_contact_name, '')), ''),
         emergency_contact_phone = nullif(btrim(coalesce(p_emergency_contact_phone, '')), ''),
         updated_at              = now()
   where profile_id = auth.uid();
end $$;

-- 5c. Admin invites a doctor or another admin.
create or replace function public.invite_staff(
  p_email text, p_role public.user_role, p_full_name text, p_doctor_id uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can invite staff';
  end if;
  if p_role not in ('doctor', 'admin') then
    raise exception 'INVALID_ROLE: staff must be a doctor or an administrator';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL: enter a valid email address';
  end if;
  if exists (select 1 from public.staff_invites where email = v_email)
     or exists (select 1 from public.profiles where email = v_email) then
    raise exception 'ALREADY_INVITED: this email already has an invitation or an account';
  end if;
  if p_doctor_id is not null and p_role <> 'doctor' then
    raise exception 'INVALID_LINK: only a doctor can be linked to a doctor listing';
  end if;
  insert into public.staff_invites (email, role, full_name, doctor_id, invited_by)
  values (v_email, p_role, btrim(p_full_name), p_doctor_id, auth.uid());
end $$;

-- 5d. Admin activates or deactivates an account (never their own).
create or replace function public.admin_set_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can do this';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'NOT_SELF: you cannot deactivate your own account';
  end if;
  update public.profiles set is_active = p_active where user_id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND: no such account';
  end if;
end $$;

-- ---------- 6. Row Level Security -------------------------------------
alter table public.profiles      enable row level security;
alter table public.patients      enable row level security;
alter table public.staff_invites enable row level security;

drop policy if exists "Read own profile, admins read all" on public.profiles;
create policy "Read own profile, admins read all" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Read own patient row, admins read all" on public.patients;
create policy "Read own patient row, admins read all" on public.patients
  for select to authenticated
  using ((profile_id = (select auth.uid()) and (select public.my_role()) = 'patient')
         or (select public.is_admin()));

drop policy if exists "Admins read invitations" on public.staff_invites;
create policy "Admins read invitations" on public.staff_invites
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "Admins cancel unused invitations" on public.staff_invites;
create policy "Admins cancel unused invitations" on public.staff_invites
  for delete to authenticated using ((select public.is_admin()) and accepted_at is null);

-- ---------- 7. Permissions --------------------------------------------
-- Signed-out visitors get nothing here. Signed-in users may READ (within
-- the rules above); every change goes through the functions in section 5.
revoke all on public.profiles, public.patients, public.staff_invites from anon, authenticated;
grant select on public.profiles, public.patients to authenticated;
grant select, delete on public.staff_invites to authenticated;

-- The doctors table gained a private column (profile_id). Visitors may read
-- only the public columns.
revoke select on public.doctors from anon, authenticated;
grant select (id, full_name, qualification, registration_no, specialities, bio,
              photo_path, consultation_fee_inr, is_active, sort_order)
  on public.doctors to anon, authenticated;

revoke execute on function public.my_role()                                               from public, anon;
revoke execute on function public.is_admin()                                              from public, anon;
revoke execute on function public.handle_new_user()                                       from public, anon, authenticated;
revoke execute on function public.complete_patient_registration(text, boolean)            from public, anon;
revoke execute on function public.update_my_patient_profile(text, date, text, text, text, text) from public, anon;
revoke execute on function public.invite_staff(text, public.user_role, text, uuid)        from public, anon;
revoke execute on function public.admin_set_active(uuid, boolean)                         from public, anon;
grant execute on function public.my_role()                                               to authenticated;
grant execute on function public.is_admin()                                              to authenticated;
grant execute on function public.complete_patient_registration(text, boolean)            to authenticated;
grant execute on function public.update_my_patient_profile(text, date, text, text, text, text) to authenticated;
grant execute on function public.invite_staff(text, public.user_role, text, uuid)        to authenticated;
grant execute on function public.admin_set_active(uuid, boolean)                         to authenticated;
