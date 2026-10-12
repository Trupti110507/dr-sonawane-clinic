-- =====================================================================
-- Dr. Sonawane Clinic App  ·  PRODUCTION SETUP, ALL IN ONE
-- This is files 001 to 012 joined together, in order, for a NEW Supabase
-- project, followed by a "clean start" that removes the sample entries.
-- Where this goes: Supabase dashboard (production project) > SQL Editor >
--   New query > paste everything > Run.
-- Afterwards run 002b_first_admin.sql (with your own email), then CHECK_security.sql.
-- Do NOT run this on the development project: it already has all of it.
-- =====================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  001_stage1_clinic_setup.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 1: clinic setup tables
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Safe to run more than once.
-- =====================================================================

-- ---------- 1. clinic_settings: exactly ONE row (single clinic) --------
create table if not exists public.clinic_settings (
  id                  boolean primary key default true check (id),  -- only "true" allowed => one row
  name                text    not null,
  tagline             text,                                   -- first line under the name
  subtitle            text,                                   -- second line under the name
  logo_path           text,                                   -- file in Supabase Storage (added later)
  address             text    not null,
  city                text    not null,
  phone_primary       text    not null,
  phone_secondary     text,
  email               text,
  primary_color       text    not null default '#4F7358' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color        text    not null default '#B9A9D9' check (accent_color  ~ '^#[0-9A-Fa-f]{6}$'),
  timezone            text    not null default 'Asia/Kolkata',
  slot_minutes        integer not null default 15  check (slot_minutes between 5 and 120),
  booking_window_days integer not null default 30  check (booking_window_days between 1 and 365),
  updated_at          timestamptz not null default now()
);

-- Adds the column if the table was created by an earlier version of this file.
alter table public.clinic_settings add column if not exists subtitle text;

-- ---------- 2. working_hours: one row per weekday ----------------------
-- weekday: 0 = Sunday, 1 = Monday ... 6 = Saturday
-- The clinic has two sessions a day, stored as open/close with a break between.
create table if not exists public.working_hours (
  weekday     smallint primary key check (weekday between 0 and 6),
  is_closed   boolean  not null default false,
  opens_at    time,
  closes_at   time,
  break_start time,
  break_end   time,
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at)),
  check ((break_start is null and break_end is null)
      or (break_start < break_end and break_start > opens_at and break_end < closes_at))
);

-- ---------- 3. holidays -------------------------------------------------
create table if not exists public.holidays (
  holiday_date date primary key,
  reason       text not null
);

-- ---------- 4. services -------------------------------------------------
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  name             text    not null unique,
  description      text,
  category         text    not null default 'Consultation',
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_inr        integer not null check (price_inr >= 0),
  is_active        boolean not null default true,
  sort_order       integer not null default 0
);

-- ---------- 5. doctors --------------------------------------------------
-- profile_id links a doctor to their login. Logins arrive in Stage 2,
-- so the column is added then.
create table if not exists public.doctors (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text    not null,
  qualification        text,
  registration_no      text,
  specialities         text,
  bio                  text,
  photo_path           text,
  consultation_fee_inr integer check (consultation_fee_inr >= 0),
  is_active            boolean not null default true,
  sort_order           integer not null default 0
);

-- =====================================================================
-- SECURITY: Row Level Security is ON for every table.
-- Stage 1 rule: anyone may READ public clinic information (it is shown
-- on the welcome page). NOBODY can change it from the app yet.
-- Admin editing rights are added in Stage 2, once logins and roles exist.
-- Until then, edit rows in Supabase > Table Editor.
-- =====================================================================
alter table public.clinic_settings enable row level security;
alter table public.working_hours   enable row level security;
alter table public.holidays        enable row level security;
alter table public.services        enable row level security;
alter table public.doctors         enable row level security;

drop policy if exists "Public can read clinic settings" on public.clinic_settings;
create policy "Public can read clinic settings" on public.clinic_settings
  for select to anon, authenticated using (true);

drop policy if exists "Public can read working hours" on public.working_hours;
create policy "Public can read working hours" on public.working_hours
  for select to anon, authenticated using (true);

drop policy if exists "Public can read holidays" on public.holidays;
create policy "Public can read holidays" on public.holidays
  for select to anon, authenticated using (true);

drop policy if exists "Public can read active services" on public.services;
create policy "Public can read active services" on public.services
  for select to anon, authenticated using (is_active);

drop policy if exists "Public can read active doctors" on public.doctors;
create policy "Public can read active doctors" on public.doctors
  for select to anon, authenticated using (is_active);

-- Belt and braces: the public roles get read permission only.
revoke all on public.clinic_settings, public.working_hours, public.holidays,
              public.services, public.doctors from anon, authenticated;
grant select on public.clinic_settings, public.working_hours, public.holidays,
                public.services, public.doctors to anon, authenticated;

-- =====================================================================
-- DATA
-- Real: clinic name, address, phone numbers, hours (given by the clinic).
-- Assumed: open Monday to Saturday, closed Sunday. Change if wrong.
-- Confirmed: consultation fee Rs. 300, follow-up fee Rs. 200.
-- SAMPLE (replace before go-live): doctor names, procedures and their prices, holidays.
-- =====================================================================
insert into public.clinic_settings (id, name, tagline, subtitle, address, city, phone_primary, phone_secondary)
values (true,
        'Dr. Sonawane',
        'Dermatologist and Venereologist',
        'Skin, Hair, Cosmetic & Laser Clinic',
        'Besides Gajanan Maharaj Mandir, Vinchur Yeola Road',
        'Yeola',
        '+91 8928774097',
        '+91 7517301266')
on conflict (id) do nothing;

insert into public.working_hours (weekday, is_closed, opens_at, closes_at, break_start, break_end) values
  (0, true,  null,    null,    null,    null),      -- Sunday (assumed closed)
  (1, false, '11:00', '21:00', '15:00', '17:30'),
  (2, false, '11:00', '21:00', '15:00', '17:30'),
  (3, false, '11:00', '21:00', '15:00', '17:30'),
  (4, false, '11:00', '21:00', '15:00', '17:30'),
  (5, false, '11:00', '21:00', '15:00', '17:30'),
  (6, false, '11:00', '21:00', '15:00', '17:30')
on conflict (weekday) do nothing;

-- Doctor names are not confirmed yet: placeholders. Consultation fee Rs. 300 is confirmed.
insert into public.doctors (full_name, qualification, specialities, consultation_fee_inr, sort_order)
select * from (values
  ('Doctor 1 (name to be added)', 'Qualification to be added', 'Dermatology', 300, 1),
  ('Doctor 2 (name to be added)', 'Qualification to be added', 'Dermatology', 300, 2),
  ('Doctor 3 (name to be added)', 'Qualification to be added', 'Dermatology', 300, 3)
) as v
where not exists (select 1 from public.doctors);

-- Consultation Rs. 300 and follow-up Rs. 200 are confirmed by the clinic.
-- Procedure names and prices are SAMPLE.
insert into public.services (name, description, category, duration_minutes, price_inr, sort_order) values
  ('Skin consultation',      'First visit: examination and treatment advice',        'Consultation', 15,  300, 1),
  ('Follow-up consultation', 'Review visit within the follow-up period',             'Consultation', 15,  200, 2),
  ('Acne treatment review',  'Assessment and treatment plan for acne and scars',     'Consultation', 15,  300, 3),
  ('Hair and scalp consultation', 'Hair fall, dandruff and scalp conditions',        'Consultation', 15,  300, 4),
  ('Chemical peel',          'Per session, after doctor assessment',                 'Procedure',    30, 1500, 5),
  ('Laser hair reduction',   'Per session, small area, after doctor assessment',     'Procedure',    45, 2500, 6),
  ('Wart or mole removal',   'Per lesion, after doctor assessment',                  'Procedure',    30, 1000, 7)
on conflict (name) do nothing;

-- SAMPLE holiday.
insert into public.holidays (holiday_date, reason) values
  ('2026-11-08', 'Diwali (sample entry)')
on conflict (holiday_date) do nothing;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  002_stage2_accounts_roles.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  003_stage3_clinic_admin.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 3: administrators manage the clinic
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 and 002. Safe to run more than once.
--
-- What this file sets up
--   * Administrators (and only administrators) may change clinic details,
--     hours, holidays, services and doctor listings.
--   * Extra checks so bad values are refused by the database itself.
--   * A storage folder for the clinic logo and doctor photos:
--     anyone may view the images, only administrators may upload or remove.
-- Patients, doctors and signed-out visitors can still only READ this data.
-- =====================================================================

-- ---------- 1. Extra validation ---------------------------------------
-- (Postgres has no "add constraint if not exists", hence the DO blocks.)
do $$ begin
  alter table public.clinic_settings add constraint clinic_settings_text_lengths check (
    char_length(btrim(name)) between 2 and 80
    and char_length(coalesce(tagline, '')) <= 120
    and char_length(coalesce(subtitle, '')) <= 120
    and char_length(btrim(address)) between 3 and 200
    and char_length(btrim(city)) between 2 and 60);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_settings add constraint clinic_settings_contacts check (
    phone_primary ~ '^\+?[0-9 ]{10,16}$'
    and (phone_secondary is null or phone_secondary ~ '^\+?[0-9 ]{10,16}$')
    and (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.services add constraint services_text_lengths check (
    char_length(btrim(name)) between 2 and 80
    and char_length(coalesce(description, '')) <= 200
    and char_length(btrim(category)) between 2 and 40
    and price_inr <= 1000000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.doctors add constraint doctors_text_lengths check (
    char_length(btrim(full_name)) between 2 and 80
    and char_length(coalesce(qualification, '')) <= 120
    and char_length(coalesce(registration_no, '')) <= 40
    and char_length(coalesce(specialities, '')) <= 160
    and char_length(coalesce(bio, '')) <= 600
    and (consultation_fee_inr is null or consultation_fee_inr <= 100000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.holidays add constraint holidays_reason_length check (
    char_length(btrim(reason)) between 2 and 80);
exception when duplicate_object then null; end $$;

-- Keep "last changed" on the clinic settings row honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists clinic_settings_touch on public.clinic_settings;
create trigger clinic_settings_touch
  before update on public.clinic_settings
  for each row execute function public.touch_updated_at();

-- ---------- 2. Who may change what (Row Level Security) ----------------
-- clinic_settings: admins edit the one row. Nobody adds or deletes rows.
drop policy if exists "Admins update clinic settings" on public.clinic_settings;
create policy "Admins update clinic settings" on public.clinic_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- working_hours: admins edit the seven rows.
drop policy if exists "Admins update working hours" on public.working_hours;
create policy "Admins update working hours" on public.working_hours
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- holidays: admins add and remove.
drop policy if exists "Admins add holidays" on public.holidays;
create policy "Admins add holidays" on public.holidays
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Admins remove holidays" on public.holidays;
create policy "Admins remove holidays" on public.holidays
  for delete to authenticated using ((select public.is_admin()));

-- services: admins see retired ones too, add and edit. No deleting:
-- a retired service stays so that old appointments and receipts still make sense.
drop policy if exists "Admins read all services" on public.services;
create policy "Admins read all services" on public.services
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins add services" on public.services;
create policy "Admins add services" on public.services
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Admins update services" on public.services;
create policy "Admins update services" on public.services
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- doctors: same pattern as services.
drop policy if exists "Admins read all doctors" on public.doctors;
create policy "Admins read all doctors" on public.doctors
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins add doctors" on public.doctors;
create policy "Admins add doctors" on public.doctors
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Admins update doctors" on public.doctors;
create policy "Admins update doctors" on public.doctors
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- 3. Permissions (column by column) --------------------------
-- The policies above decide WHO; these grants decide WHICH COLUMNS.
-- Signed-out visitors (anon) get no write permission at all.
grant update (name, tagline, subtitle, logo_path, address, city, phone_primary,
              phone_secondary, email, primary_color, accent_color,
              slot_minutes, booking_window_days)
  on public.clinic_settings to authenticated;

grant update (is_closed, opens_at, closes_at, break_start, break_end)
  on public.working_hours to authenticated;

grant insert, delete on public.holidays to authenticated;

grant insert (name, description, category, duration_minutes, price_inr, is_active, sort_order),
      update (name, description, category, duration_minutes, price_inr, is_active, sort_order)
  on public.services to authenticated;

-- profile_id (the link to a login) is deliberately NOT editable here.
grant insert (full_name, qualification, registration_no, specialities, bio,
              photo_path, consultation_fee_inr, is_active, sort_order),
      update (full_name, qualification, registration_no, specialities, bio,
              photo_path, consultation_fee_inr, is_active, sort_order)
  on public.doctors to authenticated;

-- ---------- 4. Image storage: logo and doctor photos --------------------
-- A public bucket: images are viewable by anyone with the link (they are
-- shown on the public website). Max 2 MB, images only. No patient photos
-- ever go here; those get a private bucket in a later stage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Needed so administrators can list, replace and remove their uploads.
-- (Viewing an image through its public link needs no policy.)
drop policy if exists "Admins list clinic images" on storage.objects;
create policy "Admins list clinic images" on storage.objects
  for select to authenticated
  using (bucket_id = 'clinic-assets' and (select public.is_admin()));

drop policy if exists "Admins upload clinic images" on storage.objects;
create policy "Admins upload clinic images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clinic-assets' and (select public.is_admin()));

drop policy if exists "Admins replace clinic images" on storage.objects;
create policy "Admins replace clinic images" on storage.objects
  for update to authenticated
  using (bucket_id = 'clinic-assets' and (select public.is_admin()))
  with check (bucket_id = 'clinic-assets' and (select public.is_admin()));

drop policy if exists "Admins remove clinic images" on storage.objects;
create policy "Admins remove clinic images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-assets' and (select public.is_admin()));


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  004_stage4_appointments.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 4: appointments
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001, 002 and 003. Safe to run more than once.
--
-- What this file sets up
--   appointments        every booking
--   doctor_time_off     leave or blocked hours for a doctor
--   care_relationships  which doctor may see which patient (used from Stage 5)
-- Rules enforced by the database
--   * A doctor can never have two appointments at the same time. This is a
--     database constraint, so it holds even if two people press "Book" in
--     the same instant.
--   * A slot must be inside clinic hours, not on a holiday, not in the past,
--     within the booking window, and the doctor must not be on leave.
--   * Patients see and change only their own appointments.
--   * Doctors see only their own calendar. Admins see all.
--   * Nobody edits the appointments table directly; every change goes
--     through the functions below, which re-check everything.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------- 1. Tables -------------------------------------------------
do $$ begin
  create type public.appointment_status as enum ('booked', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.profiles (user_id) on delete restrict,
  doctor_id     uuid not null references public.doctors (id) on delete restrict,
  service_id    uuid not null references public.services (id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.appointment_status not null default 'booked',
  is_follow_up  boolean not null default false,
  booked_by     uuid references public.profiles (user_id) on delete set null,
  cancelled_by  uuid references public.profiles (user_id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  -- THE double-booking guard: one doctor, no overlapping live appointments.
  constraint appointments_no_double_booking
    exclude using gist (doctor_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('booked', 'completed')),
  -- A patient cannot hold two bookings at the same time either.
  constraint appointments_patient_not_in_two_places
    exclude using gist (patient_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'booked')
);
create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at);
create index if not exists appointments_doctor_idx  on public.appointments (doctor_id, starts_at);

create table if not exists public.doctor_time_off (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text check (char_length(reason) <= 120),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists doctor_time_off_idx on public.doctor_time_off (doctor_id, starts_at);

create table if not exists public.care_relationships (
  doctor_id  uuid not null references public.doctors (id) on delete cascade,
  patient_id uuid not null references public.profiles (user_id) on delete cascade,
  source     text not null default 'appointment' check (source in ('appointment', 'assigned')),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (doctor_id, patient_id)
);

-- ---------- 2. Helpers ------------------------------------------------
-- The doctor listing that belongs to whoever is signed in (NULL if none).
create or replace function public.my_doctor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select d.id from public.doctors d
   where d.profile_id = (select auth.uid()) and public.my_role() = 'doctor'
$$;

-- Does the signed-in doctor treat this patient?
create or replace function public.doctor_treats(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.care_relationships c
                  where c.patient_id = p_patient_id and c.doctor_id = public.my_doctor_id())
$$;

-- Why a slot cannot be booked, or NULL if it can. One place for every rule,
-- used by the slot list, booking and rescheduling alike.
create or replace function public.slot_problem(
  p_doctor_id uuid, p_service_id uuid, p_starts_at timestamptz, p_exclude_id uuid default null
) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s        public.clinic_settings%rowtype;
  wh       public.working_hours%rowtype;
  v_len    integer;      -- service length in minutes
  v_local  timestamp;    -- clinic wall-clock time of the slot
  v_min    integer;      -- minutes since midnight, clinic time
  v_today  date;
  v_from   integer; v_to integer; v_bfrom integer; v_bto integer;
  v_fits   boolean := false;
  v_ends   timestamptz;
begin
  select * into s from public.clinic_settings limit 1;
  select duration_minutes into v_len from public.services where id = p_service_id and is_active;
  if not found then return 'SERVICE_UNAVAILABLE: this service is not available for booking'; end if;
  if not exists (select 1 from public.doctors where id = p_doctor_id and is_active) then
    return 'DOCTOR_UNAVAILABLE: this doctor is not available for booking';
  end if;

  v_local := p_starts_at at time zone s.timezone;
  v_today := (now() at time zone s.timezone)::date;
  v_min   := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_ends  := p_starts_at + make_interval(mins => v_len);

  if p_starts_at <= now() then return 'IN_THE_PAST: that time has already passed'; end if;
  if v_local::date > v_today + s.booking_window_days then
    return 'TOO_FAR_AHEAD: bookings open ' || s.booking_window_days || ' days in advance';
  end if;
  if exists (select 1 from public.holidays where holiday_date = v_local::date) then
    return 'HOLIDAY: the clinic is closed on that day';
  end if;

  select * into wh from public.working_hours where weekday = extract(dow from v_local)::int;
  if not found or wh.is_closed or wh.opens_at is null or wh.closes_at is null then
    return 'CLOSED: the clinic is closed on that day';
  end if;

  v_from  := extract(hour from wh.opens_at)::int  * 60 + extract(minute from wh.opens_at)::int;
  v_to    := extract(hour from wh.closes_at)::int * 60 + extract(minute from wh.closes_at)::int;
  if wh.break_start is not null and wh.break_end is not null then
    v_bfrom := extract(hour from wh.break_start)::int * 60 + extract(minute from wh.break_start)::int;
    v_bto   := extract(hour from wh.break_end)::int   * 60 + extract(minute from wh.break_end)::int;
    -- morning session, or afternoon session; slots sit on the session's grid
    v_fits := (v_min >= v_from and v_min + v_len <= v_bfrom and (v_min - v_from) % s.slot_minutes = 0)
           or (v_min >= v_bto  and v_min + v_len <= v_to    and (v_min - v_bto)  % s.slot_minutes = 0);
  else
    v_fits := (v_min >= v_from and v_min + v_len <= v_to and (v_min - v_from) % s.slot_minutes = 0);
  end if;
  if extract(second from v_local) <> 0 or not v_fits then
    return 'OUTSIDE_HOURS: that time is outside clinic hours';
  end if;

  if exists (select 1 from public.doctor_time_off t
              where t.doctor_id = p_doctor_id
                and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends)) then
    return 'DOCTOR_AWAY: the doctor is not available at that time';
  end if;
  if exists (select 1 from public.appointments a
              where a.doctor_id = p_doctor_id and a.status in ('booked', 'completed')
                and a.id is distinct from p_exclude_id
                and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_ends)) then
    return 'SLOT_TAKEN: that time has just been taken. Please choose another';
  end if;
  return null;
end $$;

-- ---------- 3. Free slots for one doctor, service and day ---------------
-- Returns times only. It never reveals who has booked what.
create or replace function public.available_slots(
  p_doctor_id uuid, p_service_id uuid, p_date date, p_exclude_id uuid default null
) returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  s  public.clinic_settings%rowtype;
  wh public.working_hours%rowtype;
  v_time time;
  v_stop time;
  r record;
begin
  if public.my_role() is null then
    raise exception 'NOT_ALLOWED: please sign in to see available times';
  end if;
  select * into s from public.clinic_settings limit 1;
  select * into wh from public.working_hours where weekday = extract(dow from p_date)::int;
  if not found or wh.is_closed or wh.opens_at is null then return; end if;

  for r in
    select wh.opens_at as f, coalesce(wh.break_start, wh.closes_at) as t
    union all
    select wh.break_end, wh.closes_at where wh.break_start is not null and wh.break_end is not null
  loop
    v_time := r.f; v_stop := r.t;
    while v_time < v_stop loop
      slot_start := (p_date + v_time) at time zone s.timezone;
      if public.slot_problem(p_doctor_id, p_service_id, slot_start, p_exclude_id) is null then
        return next;
      end if;
      exit when v_time + make_interval(mins => s.slot_minutes) <= v_time;  -- stop at midnight wrap
      v_time := v_time + make_interval(mins => s.slot_minutes);
    end loop;
  end loop;
end $$;

-- ---------- 4. Booking -------------------------------------------------
create or replace function public.book_appointment(
  p_doctor_id uuid, p_service_id uuid, p_starts_at timestamptz,
  p_patient_id uuid default null, p_is_follow_up boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role    public.user_role := public.my_role();
  v_patient uuid;
  v_len     integer;
  v_problem text;
  v_id      uuid;
  v_which   text;
begin
  if v_role is null then raise exception 'NOT_ALLOWED: please sign in to book'; end if;

  if v_role = 'patient' then
    v_patient := auth.uid();
    if not exists (select 1 from public.profiles where user_id = v_patient and full_name <> '') then
      raise exception 'PROFILE_INCOMPLETE: please add your name before booking';
    end if;
    if (select count(*) from public.appointments
         where patient_id = v_patient and status = 'booked' and starts_at > now()) >= 3 then
      raise exception 'TOO_MANY: you already have 3 upcoming appointments. Cancel one, or call the clinic';
    end if;
  else
    v_patient := p_patient_id;
    if not exists (select 1 from public.profiles
                    where user_id = v_patient and role = 'patient' and is_active) then
      raise exception 'NO_PATIENT: choose a registered, active patient';
    end if;
    if v_role = 'doctor' then
      -- A doctor may only book into their own calendar, for a patient they treat.
      if p_doctor_id is distinct from public.my_doctor_id() or not public.doctor_treats(v_patient) then
        raise exception 'NOT_ALLOWED: you can only book follow-ups for your own patients';
      end if;
    end if;
  end if;

  v_problem := public.slot_problem(p_doctor_id, p_service_id, p_starts_at);
  if v_problem is not null then raise exception '%', v_problem; end if;
  select duration_minutes into v_len from public.services where id = p_service_id;

  begin
    insert into public.appointments (patient_id, doctor_id, service_id, starts_at, ends_at, is_follow_up, booked_by)
    values (v_patient, p_doctor_id, p_service_id, p_starts_at,
            p_starts_at + make_interval(mins => v_len), coalesce(p_is_follow_up, false), auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    -- Two people chose the same slot at the same moment: the database let one through.
    get stacked diagnostics v_which = constraint_name;
    if v_which = 'appointments_patient_not_in_two_places' then
      raise exception 'PATIENT_BUSY: there is already an appointment for this patient at that time';
    end if;
    raise exception 'SLOT_TAKEN: that time has just been taken. Please choose another';
  end;

  insert into public.care_relationships (doctor_id, patient_id, source, created_by)
  values (p_doctor_id, v_patient, 'appointment', auth.uid())
  on conflict do nothing;
  return v_id;
end $$;

-- May the signed-in person change this appointment?
create or replace function public.can_manage_appointment(a public.appointments)
returns boolean language sql stable security definer set search_path = '' as $$
  select case public.my_role()
    when 'admin'   then true
    when 'doctor'  then a.doctor_id = public.my_doctor_id()
    when 'patient' then a.patient_id = (select auth.uid()) and a.starts_at > now()
    else false end
$$;

-- ---------- 5. Cancel, reschedule, mark attended ------------------------
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.can_manage_appointment(a) then
    raise exception 'NOT_ALLOWED: this appointment cannot be changed by you';
  end if;
  if a.status <> 'booked' then
    raise exception 'NOT_BOOKED: only a booked appointment can be cancelled';
  end if;
  update public.appointments
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
         cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), '')
   where id = p_id;
end $$;

create or replace function public.reschedule_appointment(p_id uuid, p_new_starts_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments%rowtype;
  v_problem text;
  v_which text;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.can_manage_appointment(a) then
    raise exception 'NOT_ALLOWED: this appointment cannot be changed by you';
  end if;
  if a.status <> 'booked' then
    raise exception 'NOT_BOOKED: only a booked appointment can be moved';
  end if;
  v_problem := public.slot_problem(a.doctor_id, a.service_id, p_new_starts_at, a.id);
  if v_problem is not null then raise exception '%', v_problem; end if;
  begin
    update public.appointments
       set starts_at = p_new_starts_at,
           ends_at   = p_new_starts_at + (a.ends_at - a.starts_at)
     where id = p_id;
  exception when exclusion_violation then
    get stacked diagnostics v_which = constraint_name;
    if v_which = 'appointments_patient_not_in_two_places' then
      raise exception 'PATIENT_BUSY: there is already an appointment for this patient at that time';
    end if;
    raise exception 'SLOT_TAKEN: that time has just been taken. Please choose another';
  end;
end $$;

-- Doctor or admin records what happened: attended, or did not come.
create or replace function public.set_appointment_outcome(p_id uuid, p_status public.appointment_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments%rowtype;
  v_tz text;
begin
  if public.my_role() not in ('doctor', 'admin') or public.my_role() is null then
    raise exception 'NOT_ALLOWED: only clinic staff can do this';
  end if;
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.can_manage_appointment(a) then
    raise exception 'NOT_ALLOWED: this appointment cannot be changed by you';
  end if;
  if p_status not in ('completed', 'no_show') then
    raise exception 'INVALID_STATUS: choose completed or no-show';
  end if;
  if a.status <> 'booked' then
    raise exception 'NOT_BOOKED: this appointment is already closed';
  end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  if (a.starts_at at time zone v_tz)::date > (now() at time zone v_tz)::date then
    raise exception 'TOO_EARLY: this appointment is on a future day';
  end if;
  update public.appointments set status = p_status where id = p_id;
end $$;

-- ---------- 6. Doctor time off -----------------------------------------
create or replace function public.add_time_off(
  p_starts_at timestamptz, p_ends_at timestamptz, p_reason text default null, p_doctor_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid;
  v_clash integer;
  v_id uuid;
begin
  if public.my_role() = 'doctor' then v_doctor := public.my_doctor_id();
  elsif public.is_admin() then v_doctor := p_doctor_id;
  end if;
  if v_doctor is null or not exists (select 1 from public.doctors where id = v_doctor) then
    raise exception 'NOT_ALLOWED: choose a doctor, or ask the administrator to link your login to your listing';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'INVALID_RANGE: the end must be after the start'; end if;
  if p_ends_at <= now() then raise exception 'IN_THE_PAST: choose a time in the future'; end if;
  if p_ends_at - p_starts_at > interval '90 days' then raise exception 'TOO_LONG: time off can be at most 90 days'; end if;
  select count(*) into v_clash from public.appointments
   where doctor_id = v_doctor and status = 'booked'
     and tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, p_ends_at);
  if v_clash > 0 then
    raise exception 'HAS_BOOKINGS: % booked appointment(s) fall in this period. Move or cancel them first', v_clash;
  end if;
  insert into public.doctor_time_off (doctor_id, starts_at, ends_at, reason, created_by)
  values (v_doctor, p_starts_at, p_ends_at, nullif(left(btrim(coalesce(p_reason, '')), 120), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.remove_time_off(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.doctor_time_off t
   where t.id = p_id and (public.is_admin() or t.doctor_id = public.my_doctor_id());
  if not found then raise exception 'NOT_ALLOWED: this time off cannot be removed by you'; end if;
end $$;

-- ---------- 7. Reading appointments ------------------------------------
-- One list for all three roles; each role gets only what it is allowed.
-- Dates are clinic-local calendar days (inclusive).
create or replace function public.list_appointments(
  p_from date, p_to date, p_doctor_id uuid default null
) returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status public.appointment_status,
  is_follow_up boolean, cancel_reason text,
  doctor_id uuid, doctor_name text,
  service_id uuid, service_name text, duration_minutes integer, price_inr integer,
  patient_id uuid, patient_name text, patient_phone text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.user_role := public.my_role();
  v_tz   text;
begin
  if v_role is null then raise exception 'NOT_ALLOWED: please sign in'; end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  return query
    select a.id, a.starts_at, a.ends_at, a.status, a.is_follow_up, a.cancel_reason,
           d.id, d.full_name, s.id, s.name, s.duration_minutes, s.price_inr,
           p.user_id, p.full_name, p.phone
      from public.appointments a
      join public.doctors  d on d.id = a.doctor_id
      join public.services s on s.id = a.service_id
      join public.profiles p on p.user_id = a.patient_id
     where a.starts_at >= (p_from::timestamp at time zone v_tz)
       and a.starts_at <  ((p_to + 1)::timestamp at time zone v_tz)
       and case v_role
             when 'patient' then a.patient_id = auth.uid()
             when 'doctor'  then a.doctor_id = public.my_doctor_id()
             when 'admin'   then p_doctor_id is null or a.doctor_id = p_doctor_id
           end
     order by a.starts_at;
end $$;

-- ---------- 8. Row Level Security --------------------------------------
alter table public.appointments       enable row level security;
alter table public.doctor_time_off    enable row level security;
alter table public.care_relationships enable row level security;

drop policy if exists "See own, own calendar, or all (admin)" on public.appointments;
create policy "See own, own calendar, or all (admin)" on public.appointments
  for select to authenticated
  using ((patient_id = (select auth.uid()) and (select public.my_role()) = 'patient')
      or doctor_id = (select public.my_doctor_id())
      or (select public.is_admin()));

drop policy if exists "Doctors see own time off, admins all" on public.doctor_time_off;
create policy "Doctors see own time off, admins all" on public.doctor_time_off
  for select to authenticated
  using (doctor_id = (select public.my_doctor_id()) or (select public.is_admin()));

drop policy if exists "See own care links, admins all" on public.care_relationships;
create policy "See own care links, admins all" on public.care_relationships
  for select to authenticated
  using (doctor_id = (select public.my_doctor_id())
      or (patient_id = (select auth.uid()) and (select public.my_role()) = 'patient')
      or (select public.is_admin()));

-- Doctors may read the name and phone of patients they treat.
drop policy if exists "Doctors read their patients' profiles" on public.profiles;
create policy "Doctors read their patients' profiles" on public.profiles
  for select to authenticated
  using (role = 'patient' and (select public.my_role()) = 'doctor' and public.doctor_treats(user_id));

-- ---------- 9. Permissions ---------------------------------------------
revoke all on public.appointments, public.doctor_time_off, public.care_relationships from anon, authenticated;
grant select on public.appointments, public.doctor_time_off, public.care_relationships to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_doctor_id()',
    'public.doctor_treats(uuid)',
    'public.slot_problem(uuid, uuid, timestamptz, uuid)',
    'public.available_slots(uuid, uuid, date, uuid)',
    'public.book_appointment(uuid, uuid, timestamptz, uuid, boolean)',
    'public.can_manage_appointment(public.appointments)',
    'public.cancel_appointment(uuid, text)',
    'public.reschedule_appointment(uuid, timestamptz)',
    'public.set_appointment_outcome(uuid, public.appointment_status)',
    'public.add_time_off(timestamptz, timestamptz, text, uuid)',
    'public.remove_time_off(uuid)',
    'public.list_appointments(date, date, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Internal helpers: not callable from the app at all.
revoke execute on function public.slot_problem(uuid, uuid, timestamptz, uuid) from authenticated;
revoke execute on function public.can_manage_appointment(public.appointments) from authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  005_stage5_clinical_records.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 5: clinical records and audit log
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 004. Safe to run more than once.
--
-- What this file sets up
--   visits                    the doctor's record of one consultation
--   visit_revisions           the earlier wording of any note that was edited
--   patient_clinical_profile  allergies, long-term conditions, current medicines
--   audit_log                 who viewed or changed which patient's record, and when
-- Rules enforced by the database
--   * Only a doctor who treats a patient can read or write that patient's
--     clinical record. Other doctors, administrators and other patients cannot.
--   * A doctor can edit only the notes they wrote themselves. Every edit keeps
--     the previous wording.
--   * Notes are never deleted.
--   * Every view of a record and every change is written to the audit log.
--     The log cannot be edited or emptied, and it holds no clinical wording,
--     so an administrator can review access without reading medical notes.
--   * A patient sees only the date, doctor and follow-up date of their own visits.
-- =====================================================================

-- ---------- 1. Tables -------------------------------------------------
create table if not exists public.visits (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.profiles (user_id) on delete restrict,
  doctor_id         uuid not null references public.doctors (id) on delete restrict,
  appointment_id    uuid unique references public.appointments (id) on delete set null,
  visit_date        date not null,
  complaints        text check (char_length(complaints) <= 4000),
  examination_notes text check (char_length(examination_notes) <= 4000),
  diagnosis         text check (char_length(diagnosis) <= 2000),
  plan              text check (char_length(plan) <= 4000),
  follow_up_date    date,
  created_by        uuid references public.profiles (user_id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (follow_up_date is null or follow_up_date >= visit_date)
);
create index if not exists visits_patient_idx on public.visits (patient_id, visit_date desc);

create table if not exists public.visit_revisions (
  id         bigint generated always as identity primary key,
  visit_id   uuid not null references public.visits (id) on delete cascade,
  patient_id uuid not null,
  revised_at timestamptz not null default now(),
  revised_by uuid,
  previous   jsonb not null     -- the note exactly as it was before the edit
);

create table if not exists public.patient_clinical_profile (
  patient_id          uuid primary key references public.profiles (user_id) on delete restrict,
  allergies           text check (char_length(allergies) <= 1000),
  conditions          text check (char_length(conditions) <= 1000),
  current_medications text check (char_length(current_medications) <= 1000),
  notes               text check (char_length(notes) <= 2000),
  updated_by          uuid references public.profiles (user_id) on delete set null,
  updated_at          timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,              -- NULL = done from the Supabase dashboard
  actor_role text,
  action     text not null check (action in ('view', 'create', 'update', 'delete', 'grant', 'revoke')),
  table_name text not null,
  record_id  text,
  patient_id uuid,
  details    jsonb              -- names of changed fields only, never their contents
);
create index if not exists audit_log_at_idx      on public.audit_log (at desc);
create index if not exists audit_log_patient_idx on public.audit_log (patient_id, at desc);

-- ---------- 2. Audit machinery ----------------------------------------
-- The log is append-only for everyone, including the database owner.
create or replace function public.audit_log_is_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'AUDIT_LOCKED: audit entries cannot be changed or removed';
end $$;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

-- Writes one audit entry for any insert, update or delete on a clinical table.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key and n.key not in ('updated_at', 'updated_by');
    if v_changed is null then return new; end if;   -- nothing really changed
    if tg_table_name = 'visits' then
      insert into public.visit_revisions (visit_id, patient_id, revised_by, previous)
      values (old.id, old.patient_id, auth.uid(), v_old);
    end if;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id, details)
  values (auth.uid(), public.my_role()::text,
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'patient_id'),
          (v_row ->> 'patient_id')::uuid,
          case when v_changed is not null then jsonb_build_object('changed', v_changed) end);
  return coalesce(new, old);
end $$;

drop trigger if exists visits_audit on public.visits;
create trigger visits_audit after insert or update or delete on public.visits
  for each row execute function public.audit_row();
drop trigger if exists clinical_profile_audit on public.patient_clinical_profile;
create trigger clinical_profile_audit after insert or update or delete on public.patient_clinical_profile
  for each row execute function public.audit_row();
drop trigger if exists appointments_audit on public.appointments;
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_row();

-- ---------- 3. Doctor: list of own patients -----------------------------
create or replace function public.my_patients()
returns table (patient_id uuid, full_name text, phone text, date_of_birth date,
               last_visit date, next_follow_up date, visits integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_doctor uuid := public.my_doctor_id();
begin
  if v_doctor is null then
    raise exception 'NOT_ALLOWED: only a doctor linked to a listing can see patients';
  end if;
  return query
    select p.user_id, p.full_name, p.phone, pt.date_of_birth,
           (select max(v.visit_date) from public.visits v where v.patient_id = p.user_id),
           (select min(v.follow_up_date) from public.visits v
             where v.patient_id = p.user_id and v.follow_up_date >= current_date),
           (select count(*)::int from public.visits v where v.patient_id = p.user_id)
      from public.care_relationships c
      join public.profiles p on p.user_id = c.patient_id
      left join public.patients pt on pt.profile_id = p.user_id
     where c.doctor_id = v_doctor
     order by p.full_name;
end $$;

-- ---------- 4. Doctor: open one patient's record (always audited) --------
create or replace function public.get_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if public.my_doctor_id() is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only open the records of patients you treat';
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (auth.uid(), 'doctor', 'view', 'patient_record', p_patient_id::text, p_patient_id);

  select jsonb_build_object(
    'patient', (select jsonb_build_object(
                  'id', p.user_id, 'full_name', p.full_name, 'phone', p.phone, 'is_active', p.is_active,
                  'date_of_birth', pt.date_of_birth, 'gender', pt.gender,
                  'emergency_contact_name', pt.emergency_contact_name,
                  'emergency_contact_phone', pt.emergency_contact_phone)
                  from public.profiles p left join public.patients pt on pt.profile_id = p.user_id
                 where p.user_id = p_patient_id),
    'profile', (select to_jsonb(c) - 'updated_by' from public.patient_clinical_profile c where c.patient_id = p_patient_id),
    'my_doctor_id', public.my_doctor_id(),
    'visits', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.id, 'visit_date', v.visit_date, 'doctor_id', v.doctor_id, 'doctor_name', d.full_name,
                 'appointment_id', v.appointment_id, 'complaints', v.complaints,
                 'examination_notes', v.examination_notes, 'diagnosis', v.diagnosis, 'plan', v.plan,
                 'follow_up_date', v.follow_up_date, 'updated_at', v.updated_at,
                 'edits', (select count(*) from public.visit_revisions r where r.visit_id = v.id))
               order by v.visit_date desc, v.created_at desc)
          from public.visits v join public.doctors d on d.id = v.doctor_id
         where v.patient_id = p_patient_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------- 5. Doctor: write a consultation note ------------------------
create or replace function public.save_visit(
  p_patient_id uuid,
  p_complaints text, p_examination_notes text, p_diagnosis text, p_plan text,
  p_follow_up_date date default null,
  p_appointment_id uuid default null,
  p_visit_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := public.my_doctor_id();
  v_tz     text;
  v_today  date;
  v_id     uuid;
  v        public.visits%rowtype;
  c text := nullif(btrim(coalesce(p_complaints, '')), '');
  e text := nullif(btrim(coalesce(p_examination_notes, '')), '');
  d text := nullif(btrim(coalesce(p_diagnosis, '')), '');
  pl text := nullif(btrim(coalesce(p_plan, '')), '');
begin
  if v_doctor is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only write notes for patients you treat';
  end if;
  if c is null and e is null and d is null and pl is null then
    raise exception 'EMPTY_NOTE: write at least one of complaints, examination, diagnosis or plan';
  end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  v_today := (now() at time zone v_tz)::date;

  if p_visit_id is not null then
    -- Editing: only the doctor who wrote the note. The old wording is kept automatically.
    select * into v from public.visits where id = p_visit_id for update;
    if not found or v.patient_id <> p_patient_id or v.doctor_id <> v_doctor then
      raise exception 'NOT_ALLOWED: only the doctor who wrote this note can edit it';
    end if;
    if p_follow_up_date is not null and (p_follow_up_date < v.visit_date or p_follow_up_date > v.visit_date + 730) then
      raise exception 'INVALID_FOLLOW_UP: choose a follow-up date after the visit, within two years';
    end if;
    update public.visits
       set complaints = c, examination_notes = e, diagnosis = d, plan = pl,
           follow_up_date = p_follow_up_date, updated_at = now()
     where id = p_visit_id;
    return p_visit_id;
  end if;

  if p_follow_up_date is not null and (p_follow_up_date < v_today or p_follow_up_date > v_today + 730) then
    raise exception 'INVALID_FOLLOW_UP: choose a follow-up date from today onwards, within two years';
  end if;
  if p_appointment_id is not null then
    if not exists (select 1 from public.appointments a
                    where a.id = p_appointment_id and a.patient_id = p_patient_id and a.doctor_id = v_doctor
                      and a.status in ('booked', 'completed')) then
      raise exception 'WRONG_APPOINTMENT: that appointment is not yours with this patient';
    end if;
    if exists (select 1 from public.visits where appointment_id = p_appointment_id) then
      raise exception 'ALREADY_NOTED: this appointment already has a note. Open it and edit instead';
    end if;
  end if;

  insert into public.visits (patient_id, doctor_id, appointment_id, visit_date, complaints,
                             examination_notes, diagnosis, plan, follow_up_date, created_by)
  values (p_patient_id, v_doctor, p_appointment_id, v_today, c, e, d, pl, p_follow_up_date, auth.uid())
  returning id into v_id;

  -- Writing the note for a booked appointment on or before today marks it attended.
  update public.appointments a set status = 'completed'
   where a.id = p_appointment_id and a.status = 'booked'
     and (a.starts_at at time zone v_tz)::date <= v_today;
  return v_id;
end $$;

-- ---------- 6. Doctor: allergies, conditions, current medicines ---------
create or replace function public.save_clinical_profile(
  p_patient_id uuid, p_allergies text, p_conditions text, p_current_medications text, p_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_doctor_id() is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only update patients you treat';
  end if;
  insert into public.patient_clinical_profile (patient_id, allergies, conditions, current_medications, notes, updated_by)
  values (p_patient_id, nullif(btrim(coalesce(p_allergies, '')), ''), nullif(btrim(coalesce(p_conditions, '')), ''),
          nullif(btrim(coalesce(p_current_medications, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (patient_id) do update
     set allergies = excluded.allergies, conditions = excluded.conditions,
         current_medications = excluded.current_medications, notes = excluded.notes,
         updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Earlier wording of one note, for the doctors who treat that patient.
create or replace function public.visit_history(p_visit_id uuid)
returns table (revised_at timestamptz, previous jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.visits v where v.id = p_visit_id
                  and public.my_doctor_id() is not null and public.doctor_treats(v.patient_id)) then
    raise exception 'NOT_ALLOWED: you can only open the records of patients you treat';
  end if;
  return query
    select r.revised_at,
           r.previous - 'id' - 'patient_id' - 'doctor_id' - 'appointment_id' - 'created_by' - 'created_at'
      from public.visit_revisions r where r.visit_id = p_visit_id order by r.revised_at desc;
end $$;

-- ---------- 7. Patient: own visits, without clinical wording ------------
create or replace function public.my_visit_summaries()
returns table (visit_date date, doctor_name text, follow_up_date date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return query
    select v.visit_date, d.full_name, v.follow_up_date
      from public.visits v join public.doctors d on d.id = v.doctor_id
     where v.patient_id = auth.uid()
     order by v.visit_date desc, v.created_at desc;
end $$;

-- ---------- 8. Admin: who may see whom, and the access log --------------
create or replace function public.admin_set_care(p_patient_id uuid, p_doctor_id uuid, p_allow boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only an administrator can do this'; end if;
  if not exists (select 1 from public.profiles where user_id = p_patient_id and role = 'patient')
     or not exists (select 1 from public.doctors where id = p_doctor_id) then
    raise exception 'NOT_FOUND: choose a registered patient and a doctor';
  end if;
  if p_allow then
    insert into public.care_relationships (doctor_id, patient_id, source, created_by)
    values (p_doctor_id, p_patient_id, 'assigned', auth.uid()) on conflict do nothing;
    if not found then return; end if;
  else
    delete from public.care_relationships where doctor_id = p_doctor_id and patient_id = p_patient_id;
    if not found then return; end if;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id, details)
  values (auth.uid(), 'admin', case when p_allow then 'grant' else 'revoke' end, 'care_relationships',
          p_doctor_id::text, p_patient_id, jsonb_build_object('doctor_id', p_doctor_id));
end $$;

create or replace function public.list_care(p_patient_id uuid)
returns table (doctor_id uuid, doctor_name text, source text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only an administrator can do this'; end if;
  return query
    select d.id, d.full_name, c.source from public.care_relationships c
      join public.doctors d on d.id = c.doctor_id
     where c.patient_id = p_patient_id order by d.sort_order;
end $$;

create or replace function public.list_audit(p_from date, p_to date)
returns table (id bigint, at timestamptz, actor_name text, actor_role text, action text,
               table_name text, patient_name text, changed text)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only an administrator can see the access log'; end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  return query
    select l.id, l.at, coalesce(nullif(a.full_name, ''), case when l.actor_id is null then 'Supabase dashboard' else 'Unknown' end),
           l.actor_role, l.action, l.table_name, nullif(p.full_name, ''),
           (select string_agg(x, ', ') from jsonb_array_elements_text(l.details -> 'changed') x)
      from public.audit_log l
      left join public.profiles a on a.user_id = l.actor_id
      left join public.profiles p on p.user_id = l.patient_id
     where l.at >= (p_from::timestamp at time zone v_tz) and l.at < ((p_to + 1)::timestamp at time zone v_tz)
     order by l.at desc
     limit 1000;
end $$;

-- ---------- 9. Row Level Security and permissions -----------------------
alter table public.visits                   enable row level security;
alter table public.visit_revisions          enable row level security;
alter table public.patient_clinical_profile enable row level security;
alter table public.audit_log                enable row level security;

drop policy if exists "Treating doctors read visits" on public.visits;
create policy "Treating doctors read visits" on public.visits
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and public.doctor_treats(patient_id));

drop policy if exists "Treating doctors read revisions" on public.visit_revisions;
create policy "Treating doctors read revisions" on public.visit_revisions
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and public.doctor_treats(patient_id));

drop policy if exists "Treating doctors read clinical profile" on public.patient_clinical_profile;
create policy "Treating doctors read clinical profile" on public.patient_clinical_profile
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and public.doctor_treats(patient_id));

drop policy if exists "Admins read the audit log" on public.audit_log;
create policy "Admins read the audit log" on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- Read-only for the app. Every write goes through the functions above.
revoke all on public.visits, public.visit_revisions, public.patient_clinical_profile, public.audit_log
  from anon, authenticated;
grant select on public.visits, public.visit_revisions, public.patient_clinical_profile, public.audit_log
  to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_patients()',
    'public.get_patient_record(uuid)',
    'public.save_visit(uuid, text, text, text, text, date, uuid, uuid)',
    'public.save_clinical_profile(uuid, text, text, text, text)',
    'public.visit_history(uuid)',
    'public.my_visit_summaries()',
    'public.admin_set_care(uuid, uuid, boolean)',
    'public.list_care(uuid)',
    'public.list_audit(date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.audit_log_is_append_only() from public, anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  006_stage6_prescriptions.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 6: prescriptions and treatment plans
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 005. Safe to run more than once.
--
-- What this file sets up
--   prescriptions        one prescription: draft, approved or withdrawn
--   prescription_items   each medicine line
--   treatment_plans      multi-session treatments (peels, laser and so on)
-- Rules enforced by the database
--   * Only a doctor who treats the patient can write a prescription or plan.
--   * A prescription starts as a DRAFT. The patient cannot see a draft.
--   * Only the doctor who wrote it can approve it. Approval is a deliberate,
--     separate step, and it locks the prescription: an approved prescription
--     can never be edited. If it is wrong, the doctor withdraws it and writes
--     a new one, so the patient never holds a silently changed prescription.
--   * The patient sees only their own APPROVED prescriptions.
--   * Administrators cannot read prescriptions or plans.
--   * Every medicine line is typed by the doctor. Nothing is suggested,
--     pre-filled or generated.
--   * Creating, changing, approving and withdrawing are all in the access log.
-- =====================================================================

-- ---------- 1. Tables -------------------------------------------------
do $$ begin
  create type public.prescription_status as enum ('draft', 'approved', 'withdrawn');
exception when duplicate_object then null;
end $$;

create table if not exists public.prescriptions (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.profiles (user_id) on delete restrict,
  doctor_id            uuid not null references public.doctors (id) on delete restrict,
  visit_id             uuid references public.visits (id) on delete set null,
  status               public.prescription_status not null default 'draft',
  general_instructions text check (char_length(general_instructions) <= 2000),
  revision             integer not null default 1,     -- goes up on every saved change to a draft
  approved_at          timestamptz,
  withdrawn_at         timestamptz,
  withdraw_reason      text check (char_length(withdraw_reason) <= 300),
  created_by           uuid references public.profiles (user_id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((status = 'draft') = (approved_at is null))
);
create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id, created_at desc);

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  position        integer not null,
  medicine_name   text not null check (char_length(btrim(medicine_name)) between 1 and 120),
  dosage          text check (char_length(dosage) <= 120),
  frequency       text check (char_length(frequency) <= 120),
  duration        text check (char_length(duration) <= 120),
  instructions    text check (char_length(instructions) <= 300),
  unique (prescription_id, position)
);

do $$ begin
  create type public.plan_status as enum ('active', 'completed', 'stopped');
exception when duplicate_object then null;
end $$;

create table if not exists public.treatment_plans (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.profiles (user_id) on delete restrict,
  doctor_id            uuid not null references public.doctors (id) on delete restrict,
  title                text not null check (char_length(btrim(title)) between 2 and 120),
  patient_instructions text check (char_length(patient_instructions) <= 2000),  -- the patient sees this
  clinical_notes       text check (char_length(clinical_notes) <= 2000),        -- doctors only
  total_sessions       integer not null check (total_sessions between 1 and 60),
  sessions_done        integer not null default 0 check (sessions_done >= 0),
  status               public.plan_status not null default 'active',
  started_on           date not null default current_date,
  created_by           uuid references public.profiles (user_id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (sessions_done <= total_sessions)
);
create index if not exists treatment_plans_patient_idx on public.treatment_plans (patient_id, created_at desc);

-- A locked prescription stays locked, whatever tries to change it.
create or replace function public.prescription_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'prescriptions' then
    if tg_op = 'DELETE' then
      if old.status <> 'draft' then raise exception 'LOCKED: an approved prescription cannot be deleted'; end if;
      return old;
    end if;
    if old.status = 'withdrawn' then
      raise exception 'LOCKED: a withdrawn prescription cannot be changed';
    end if;
    if old.status = 'approved' and not (
         new.status = 'withdrawn'
         and new.general_instructions is not distinct from old.general_instructions
         and new.patient_id = old.patient_id and new.doctor_id = old.doctor_id
         and new.approved_at = old.approved_at) then
      raise exception 'LOCKED: an approved prescription cannot be changed. Withdraw it and write a new one';
    end if;
    return new;
  end if;
  -- prescription_items: only while the prescription is a draft
  if exists (select 1 from public.prescriptions p
              where p.id = coalesce(new.prescription_id, old.prescription_id) and p.status <> 'draft') then
    raise exception 'LOCKED: the medicines of an approved prescription cannot be changed';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists prescriptions_lock on public.prescriptions;
create trigger prescriptions_lock before update or delete on public.prescriptions
  for each row execute function public.prescription_lock();
drop trigger if exists prescription_items_lock on public.prescription_items;
create trigger prescription_items_lock before insert or update or delete on public.prescription_items
  for each row execute function public.prescription_lock();

-- Access log (the audit_row function comes from Stage 5).
drop trigger if exists prescriptions_audit on public.prescriptions;
create trigger prescriptions_audit after insert or update or delete on public.prescriptions
  for each row execute function public.audit_row();
drop trigger if exists treatment_plans_audit on public.treatment_plans;
create trigger treatment_plans_audit after insert or update or delete on public.treatment_plans
  for each row execute function public.audit_row();

-- ---------- 2. Doctor: write or change a DRAFT ---------------------------
-- p_items is a list like:
--   [{"medicine_name":"…","dosage":"…","frequency":"…","duration":"…","instructions":"…"}, …]
create or replace function public.save_prescription(
  p_patient_id uuid, p_general_instructions text, p_items jsonb,
  p_visit_id uuid default null, p_prescription_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := public.my_doctor_id();
  v_id     uuid := p_prescription_id;
  v_notes  text := nullif(btrim(coalesce(p_general_instructions, '')), '');
  v_item   jsonb;
  v_pos    integer := 0;
  rx       public.prescriptions%rowtype;
begin
  if v_doctor is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only prescribe for patients you treat';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS: the list of medicines is not in the expected form';
  end if;
  if jsonb_array_length(p_items) = 0 and v_notes is null then
    raise exception 'EMPTY_PRESCRIPTION: add at least one medicine or an instruction';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'TOO_MANY_ITEMS: a prescription can hold at most 20 medicines';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if nullif(btrim(coalesce(v_item ->> 'medicine_name', '')), '') is null then
      raise exception 'MISSING_MEDICINE: every line needs the name of the medicine';
    end if;
  end loop;
  if p_visit_id is not null and not exists (
       select 1 from public.visits v where v.id = p_visit_id and v.patient_id = p_patient_id) then
    raise exception 'WRONG_VISIT: that consultation belongs to a different patient';
  end if;

  if v_id is null then
    insert into public.prescriptions (patient_id, doctor_id, visit_id, general_instructions, created_by)
    values (p_patient_id, v_doctor, p_visit_id, v_notes, auth.uid())
    returning id into v_id;
  else
    select * into rx from public.prescriptions where id = v_id for update;
    if not found or rx.patient_id <> p_patient_id or rx.doctor_id <> v_doctor then
      raise exception 'NOT_ALLOWED: only the doctor who wrote this prescription can change it';
    end if;
    if rx.status <> 'draft' then
      raise exception 'LOCKED: an approved prescription cannot be changed. Withdraw it and write a new one';
    end if;
    update public.prescriptions
       set general_instructions = v_notes, revision = revision + 1, updated_at = now()
     where id = v_id;
    delete from public.prescription_items where prescription_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    insert into public.prescription_items (prescription_id, position, medicine_name, dosage, frequency, duration, instructions)
    values (v_id, v_pos, btrim(v_item ->> 'medicine_name'),
            nullif(btrim(coalesce(v_item ->> 'dosage', '')), ''),
            nullif(btrim(coalesce(v_item ->> 'frequency', '')), ''),
            nullif(btrim(coalesce(v_item ->> 'duration', '')), ''),
            nullif(btrim(coalesce(v_item ->> 'instructions', '')), ''));
  end loop;
  return v_id;
end $$;

-- ---------- 3. Doctor: approve, withdraw, or discard a draft --------------
create or replace function public.approve_prescription(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare rx public.prescriptions%rowtype;
begin
  select * into rx from public.prescriptions where id = p_id for update;
  if not found or rx.doctor_id is distinct from public.my_doctor_id() or not public.doctor_treats(rx.patient_id) then
    raise exception 'NOT_ALLOWED: only the doctor who wrote this prescription can approve it';
  end if;
  if rx.status <> 'draft' then raise exception 'NOT_A_DRAFT: this prescription has already been approved'; end if;
  if rx.general_instructions is null
     and not exists (select 1 from public.prescription_items where prescription_id = p_id) then
    raise exception 'EMPTY_PRESCRIPTION: add at least one medicine or an instruction';
  end if;
  update public.prescriptions set status = 'approved', approved_at = now(), updated_at = now() where id = p_id;
end $$;

create or replace function public.withdraw_prescription(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rx public.prescriptions%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  select * into rx from public.prescriptions where id = p_id for update;
  if not found or rx.doctor_id is distinct from public.my_doctor_id() or not public.doctor_treats(rx.patient_id) then
    raise exception 'NOT_ALLOWED: only the doctor who wrote this prescription can withdraw it';
  end if;
  if rx.status <> 'approved' then raise exception 'NOT_APPROVED: only an approved prescription can be withdrawn'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED: say why the prescription is withdrawn'; end if;
  update public.prescriptions
     set status = 'withdrawn', withdrawn_at = now(), withdraw_reason = v_reason, updated_at = now()
   where id = p_id;
end $$;

create or replace function public.delete_draft_prescription(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare rx public.prescriptions%rowtype;
begin
  select * into rx from public.prescriptions where id = p_id for update;
  if not found or rx.doctor_id is distinct from public.my_doctor_id() then
    raise exception 'NOT_ALLOWED: only the doctor who wrote this draft can discard it';
  end if;
  if rx.status <> 'draft' then raise exception 'LOCKED: an approved prescription cannot be deleted'; end if;
  delete from public.prescriptions where id = p_id;
end $$;

-- ---------- 4. Doctor: treatment plans -----------------------------------
create or replace function public.save_treatment_plan(
  p_patient_id uuid, p_title text, p_patient_instructions text, p_clinical_notes text,
  p_total_sessions integer, p_sessions_done integer default 0,
  p_status public.plan_status default 'active', p_plan_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := public.my_doctor_id();
  v_id uuid := p_plan_id;
  v_tz text;
  pl public.treatment_plans%rowtype;
begin
  if v_doctor is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only plan treatment for patients you treat';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) < 2 then
    raise exception 'INVALID_TITLE: give the plan a name, for example Chemical peel course';
  end if;
  if p_total_sessions is null or p_total_sessions < 1 or p_total_sessions > 60 then
    raise exception 'INVALID_SESSIONS: enter the number of sessions, from 1 to 60';
  end if;
  if coalesce(p_sessions_done, 0) < 0 or coalesce(p_sessions_done, 0) > p_total_sessions then
    raise exception 'INVALID_SESSIONS: sessions done must be between 0 and the total';
  end if;

  if v_id is null then
    select timezone into v_tz from public.clinic_settings limit 1;
    insert into public.treatment_plans (patient_id, doctor_id, title, patient_instructions, clinical_notes,
                                        total_sessions, sessions_done, status, started_on, created_by)
    values (p_patient_id, v_doctor, btrim(p_title), nullif(btrim(coalesce(p_patient_instructions, '')), ''),
            nullif(btrim(coalesce(p_clinical_notes, '')), ''), p_total_sessions, coalesce(p_sessions_done, 0),
            coalesce(p_status, 'active'), (now() at time zone v_tz)::date, auth.uid())
    returning id into v_id;
  else
    select * into pl from public.treatment_plans where id = v_id for update;
    if not found or pl.patient_id <> p_patient_id or pl.doctor_id <> v_doctor then
      raise exception 'NOT_ALLOWED: only the doctor who made this plan can change it';
    end if;
    update public.treatment_plans
       set title = btrim(p_title),
           patient_instructions = nullif(btrim(coalesce(p_patient_instructions, '')), ''),
           clinical_notes = nullif(btrim(coalesce(p_clinical_notes, '')), ''),
           total_sessions = p_total_sessions, sessions_done = coalesce(p_sessions_done, 0),
           status = coalesce(p_status, 'active'), updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;

-- One prescription with its medicines and the prescriber's details (internal helper).
create or replace function public.prescription_json(rx public.prescriptions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', rx.id, 'status', rx.status, 'created_at', rx.created_at, 'approved_at', rx.approved_at,
    'withdrawn_at', rx.withdrawn_at, 'withdraw_reason', rx.withdraw_reason,
    'general_instructions', rx.general_instructions, 'visit_id', rx.visit_id,
    'doctor_id', rx.doctor_id, 'doctor_name', d.full_name,
    'doctor_qualification', d.qualification, 'doctor_registration_no', d.registration_no,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'medicine_name', i.medicine_name, 'dosage', i.dosage, 'frequency', i.frequency,
                         'duration', i.duration, 'instructions', i.instructions) order by i.position)
                         from public.prescription_items i where i.prescription_id = rx.id), '[]'::jsonb))
    from public.doctors d where d.id = rx.doctor_id
$$;

-- ---------- 5. Doctor: the patient record now includes both --------------
create or replace function public.get_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if public.my_doctor_id() is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only open the records of patients you treat';
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (auth.uid(), 'doctor', 'view', 'patient_record', p_patient_id::text, p_patient_id);

  select jsonb_build_object(
    'patient', (select jsonb_build_object(
                  'id', p.user_id, 'full_name', p.full_name, 'phone', p.phone, 'is_active', p.is_active,
                  'date_of_birth', pt.date_of_birth, 'gender', pt.gender,
                  'emergency_contact_name', pt.emergency_contact_name,
                  'emergency_contact_phone', pt.emergency_contact_phone)
                  from public.profiles p left join public.patients pt on pt.profile_id = p.user_id
                 where p.user_id = p_patient_id),
    'profile', (select to_jsonb(c) - 'updated_by' from public.patient_clinical_profile c where c.patient_id = p_patient_id),
    'my_doctor_id', public.my_doctor_id(),
    'visits', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.id, 'visit_date', v.visit_date, 'doctor_id', v.doctor_id, 'doctor_name', d.full_name,
                 'appointment_id', v.appointment_id, 'complaints', v.complaints,
                 'examination_notes', v.examination_notes, 'diagnosis', v.diagnosis, 'plan', v.plan,
                 'follow_up_date', v.follow_up_date, 'updated_at', v.updated_at,
                 'edits', (select count(*) from public.visit_revisions r where r.visit_id = v.id))
               order by v.visit_date desc, v.created_at desc)
          from public.visits v join public.doctors d on d.id = v.doctor_id
         where v.patient_id = p_patient_id), '[]'::jsonb),
    'prescriptions', coalesce((
        select jsonb_agg(public.prescription_json(rx) order by rx.created_at desc)
          from public.prescriptions rx where rx.patient_id = p_patient_id), '[]'::jsonb),
    'treatment_plans', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', t.id, 'doctor_id', t.doctor_id, 'doctor_name', d.full_name, 'title', t.title,
                 'patient_instructions', t.patient_instructions, 'clinical_notes', t.clinical_notes,
                 'total_sessions', t.total_sessions, 'sessions_done', t.sessions_done,
                 'status', t.status, 'started_on', t.started_on)
               order by (t.status = 'active') desc, t.created_at desc)
          from public.treatment_plans t join public.doctors d on d.id = t.doctor_id
         where t.patient_id = p_patient_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------- 6. Patient: own APPROVED prescriptions and own plans ---------
create or replace function public.my_prescriptions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return coalesce((
    select jsonb_agg(public.prescription_json(rx) - 'visit_id' - 'withdrawn_at' - 'withdraw_reason'
                     order by rx.approved_at desc)
      from public.prescriptions rx
     where rx.patient_id = auth.uid() and rx.status = 'approved'), '[]'::jsonb);
end $$;

create or replace function public.my_treatment_plans()
returns table (id uuid, title text, doctor_name text, patient_instructions text,
               total_sessions integer, sessions_done integer, status public.plan_status, started_on date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return query
    select t.id, t.title, d.full_name, t.patient_instructions, t.total_sessions, t.sessions_done, t.status, t.started_on
      from public.treatment_plans t join public.doctors d on d.id = t.doctor_id
     where t.patient_id = auth.uid()
     order by (t.status = 'active') desc, t.created_at desc;
end $$;

-- ---------- 7. Row Level Security and permissions ------------------------
alter table public.prescriptions      enable row level security;
alter table public.prescription_items enable row level security;
alter table public.treatment_plans    enable row level security;

drop policy if exists "Treating doctors read prescriptions" on public.prescriptions;
create policy "Treating doctors read prescriptions" on public.prescriptions
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and public.doctor_treats(patient_id));

drop policy if exists "Treating doctors read prescription items" on public.prescription_items;
create policy "Treating doctors read prescription items" on public.prescription_items
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and exists (
           select 1 from public.prescriptions p
            where p.id = prescription_id and public.doctor_treats(p.patient_id)));

drop policy if exists "Treating doctors read treatment plans" on public.treatment_plans;
create policy "Treating doctors read treatment plans" on public.treatment_plans
  for select to authenticated
  using ((select public.my_doctor_id()) is not null and public.doctor_treats(patient_id));

revoke all on public.prescriptions, public.prescription_items, public.treatment_plans from anon, authenticated;
grant select on public.prescriptions, public.prescription_items, public.treatment_plans to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.save_prescription(uuid, text, jsonb, uuid, uuid)',
    'public.approve_prescription(uuid)',
    'public.withdraw_prescription(uuid, text)',
    'public.delete_draft_prescription(uuid)',
    'public.save_treatment_plan(uuid, text, text, text, integer, integer, public.plan_status, uuid)',
    'public.get_patient_record(uuid)',
    'public.my_prescriptions()',
    'public.my_treatment_plans()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.prescription_json(public.prescriptions) from public, anon, authenticated;
revoke execute on function public.prescription_lock() from public, anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  007_stage7_progress_photos.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 7: progress photos
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 006. Safe to run more than once.
--
-- What this file sets up
--   photo_consents   the patient's agreement to clinical photographs
--   patient_photos   one row per photograph (the picture itself is in Storage)
--   patient-photos   a PRIVATE storage folder. Nothing in it has a public link.
-- Rules enforced by the database
--   * No photo can be uploaded unless the patient's consent is on record.
--   * Only a doctor who treats the patient can upload or see the photos.
--   * The patient sees a photo only when the doctor has chosen to share it.
--   * Administrators cannot see patient photos.
--   * Pictures are opened through links that stop working after a few minutes.
--   * Consent, uploads, sharing and deletions are all in the access log.
-- =====================================================================

-- ---------- 1. Tables -------------------------------------------------
create table if not exists public.photo_consents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.profiles (user_id) on delete restrict,
  method       text not null check (method in ('patient_portal', 'at_clinic')),
  wording      text not null check (char_length(wording) between 20 and 2000),  -- the exact text agreed to
  given_at     timestamptz not null default now(),
  recorded_by  uuid references public.profiles (user_id) on delete set null,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (user_id) on delete set null
);
-- At most one consent in force per patient.
create unique index if not exists photo_consents_one_active
  on public.photo_consents (patient_id) where withdrawn_at is null;

create table if not exists public.patient_photos (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.profiles (user_id) on delete restrict,
  doctor_id           uuid not null references public.doctors (id) on delete restrict,
  storage_path        text not null unique,
  body_area           text not null check (char_length(btrim(body_area)) between 2 and 60),
  taken_on            date not null,
  note                text check (char_length(note) <= 300),
  shared_with_patient boolean not null default false,
  uploaded_by         uuid references public.profiles (user_id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists patient_photos_patient_idx on public.patient_photos (patient_id, taken_on);

drop trigger if exists photo_consents_audit on public.photo_consents;
create trigger photo_consents_audit after insert or update or delete on public.photo_consents
  for each row execute function public.audit_row();
drop trigger if exists patient_photos_audit on public.patient_photos;
create trigger patient_photos_audit after insert or update or delete on public.patient_photos
  for each row execute function public.audit_row();

-- ---------- 2. The private storage folder --------------------------------
-- public = false: there is no public link. 5 MB limit. JPEG only (the app
-- converts every photo to JPEG before upload, which also removes hidden
-- details such as the GPS location saved by phone cameras).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-photos', 'patient-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 3. Helper rules ----------------------------------------------
-- Files are stored as  <patient id>/<random id>.jpg . This reads the patient
-- id from a file name, and gives nothing for any other shape of name.
create or replace function public.photo_patient(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
              then left(p_name, 36)::uuid end
$$;

create or replace function public.has_photo_consent(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photo_consents c where c.patient_id = p_patient_id and c.withdrawn_at is null)
$$;

-- May the signed-in person upload a file with this name?
create or replace function public.photo_can_upload(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_doctor_id() is not null
     and public.photo_patient(p_name) is not null
     and public.doctor_treats(public.photo_patient(p_name))
     and public.has_photo_consent(public.photo_patient(p_name))
$$;

-- May the signed-in person open this file?
create or replace function public.photo_can_read(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.photo_patient(p_name) is not null and (
           (public.my_doctor_id() is not null and public.doctor_treats(public.photo_patient(p_name)))
        or (public.my_role() = 'patient' and exists (
              select 1 from public.patient_photos p
               where p.storage_path = p_name and p.patient_id = auth.uid() and p.shared_with_patient)))
$$;

-- A file can be removed from storage only once its record is gone (see
-- delete_patient_photo), or if its record was never made (a failed upload).
create or replace function public.photo_can_remove(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_doctor_id() is not null
     and public.photo_patient(p_name) is not null
     and public.doctor_treats(public.photo_patient(p_name))
     and not exists (select 1 from public.patient_photos p where p.storage_path = p_name)
$$;

drop policy if exists "Treating doctors upload patient photos" on storage.objects;
create policy "Treating doctors upload patient photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-photos' and public.photo_can_upload(name));

drop policy if exists "Patient photos are opened only by those allowed" on storage.objects;
create policy "Patient photos are opened only by those allowed" on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-photos' and public.photo_can_read(name));

drop policy if exists "Treating doctors remove unrecorded patient photos" on storage.objects;
create policy "Treating doctors remove unrecorded patient photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-photos' and public.photo_can_remove(name));
-- No update policy: a stored photo can never be replaced by another picture.

-- ---------- 4. Consent ---------------------------------------------------
-- The patient agrees in their own portal.
create or replace function public.give_photo_consent(p_agree boolean, p_wording text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  if p_agree is not true then raise exception 'CONSENT_REQUIRED: tick the box to agree'; end if;
  if public.has_photo_consent(auth.uid()) then return; end if;
  insert into public.photo_consents (patient_id, method, wording, recorded_by)
  values (auth.uid(), 'patient_portal', btrim(p_wording), auth.uid());
end $$;

-- The treating doctor records consent the patient gave in person at the clinic.
create or replace function public.record_photo_consent(p_patient_id uuid, p_confirm boolean, p_wording text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_doctor_id() is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only record consent for patients you treat';
  end if;
  if p_confirm is not true then
    raise exception 'CONSENT_REQUIRED: confirm that the patient has agreed';
  end if;
  if public.has_photo_consent(p_patient_id) then return; end if;
  insert into public.photo_consents (patient_id, method, wording, recorded_by)
  values (p_patient_id, 'at_clinic', btrim(p_wording), auth.uid());
end $$;

-- The patient withdraws (no argument), or the treating doctor does it at the patient's request.
create or replace function public.withdraw_photo_consent(p_patient_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;
begin
  if public.my_role() = 'patient' then
    v_patient := auth.uid();
  elsif public.my_doctor_id() is not null and p_patient_id is not null and public.doctor_treats(p_patient_id) then
    v_patient := p_patient_id;
  else
    raise exception 'NOT_ALLOWED: you cannot change this consent';
  end if;
  update public.photo_consents
     set withdrawn_at = now(), withdrawn_by = auth.uid()
   where patient_id = v_patient and withdrawn_at is null;
  -- Photos already shared stay visible to the patient; nothing new can be added.
end $$;

create or replace function public.photo_consent_json(p_patient_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('given_at', c.given_at, 'method', c.method, 'recorded_by_name', p.full_name)
    from public.photo_consents c left join public.profiles p on p.user_id = c.recorded_by
   where c.patient_id = p_patient_id and c.withdrawn_at is null
$$;

-- ---------- 5. Doctor: photos of a patient -------------------------------
create or replace function public.add_patient_photo(
  p_patient_id uuid, p_path text, p_body_area text, p_taken_on date, p_note text, p_share boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doctor uuid := public.my_doctor_id();
  v_today  date;
  v_id     uuid;
begin
  if v_doctor is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only add photos for patients you treat';
  end if;
  if not public.has_photo_consent(p_patient_id) then
    raise exception 'NO_CONSENT: the patient has not agreed to photographs. Record their consent first';
  end if;
  if public.photo_patient(p_path) is distinct from p_patient_id then
    raise exception 'WRONG_FILE: that file does not belong to this patient';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'patient-photos' and o.name = p_path) then
    raise exception 'FILE_MISSING: the photo did not finish uploading. Please try again';
  end if;
  if char_length(btrim(coalesce(p_body_area, ''))) < 2 then
    raise exception 'INVALID_AREA: say which part of the body the photo shows';
  end if;
  select (now() at time zone timezone)::date into v_today from public.clinic_settings limit 1;
  if p_taken_on is null or p_taken_on > v_today or p_taken_on < date '2000-01-01' then
    raise exception 'INVALID_DATE: the date taken cannot be in the future';
  end if;
  insert into public.patient_photos (patient_id, doctor_id, storage_path, body_area, taken_on, note, shared_with_patient, uploaded_by)
  values (p_patient_id, v_doctor, p_path, btrim(p_body_area), p_taken_on,
          nullif(left(btrim(coalesce(p_note, '')), 300), ''), coalesce(p_share, false), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_photo_shared(p_id uuid, p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare ph public.patient_photos%rowtype;
begin
  select * into ph from public.patient_photos where id = p_id for update;
  if not found or public.my_doctor_id() is null or not public.doctor_treats(ph.patient_id) then
    raise exception 'NOT_ALLOWED: you can only change photos of patients you treat';
  end if;
  update public.patient_photos set shared_with_patient = coalesce(p_share, false) where id = p_id;
end $$;

-- Removes the record and returns the file name; the app then removes the file itself.
create or replace function public.delete_patient_photo(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare ph public.patient_photos%rowtype;
begin
  select * into ph from public.patient_photos where id = p_id for update;
  if not found or public.my_doctor_id() is null or not public.doctor_treats(ph.patient_id) then
    raise exception 'NOT_ALLOWED: you can only delete photos of patients you treat';
  end if;
  delete from public.patient_photos where id = p_id;
  return ph.storage_path;
end $$;

create or replace function public.patient_photos_for(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_doctor_id() is null or not public.doctor_treats(p_patient_id) then
    raise exception 'NOT_ALLOWED: you can only see photos of patients you treat';
  end if;
  return jsonb_build_object(
    'consent', public.photo_consent_json(p_patient_id),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ph.id, 'storage_path', ph.storage_path, 'body_area', ph.body_area, 'taken_on', ph.taken_on,
               'note', ph.note, 'shared_with_patient', ph.shared_with_patient, 'doctor_name', d.full_name)
             order by lower(ph.body_area), ph.taken_on, ph.created_at)
        from public.patient_photos ph join public.doctors d on d.id = ph.doctor_id
       where ph.patient_id = p_patient_id), '[]'::jsonb));
end $$;

-- ---------- 6. Patient: own consent and the photos shared with them -------
create or replace function public.my_photos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return jsonb_build_object(
    'consent', public.photo_consent_json(auth.uid()),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ph.id, 'storage_path', ph.storage_path, 'body_area', ph.body_area,
               'taken_on', ph.taken_on, 'doctor_name', d.full_name)
             order by lower(ph.body_area), ph.taken_on, ph.created_at)
        from public.patient_photos ph join public.doctors d on d.id = ph.doctor_id
       where ph.patient_id = auth.uid() and ph.shared_with_patient), '[]'::jsonb));
end $$;

-- ---------- 7. Row Level Security and permissions ------------------------
-- No policies at all: these two tables are reached only through the functions above.
alter table public.photo_consents enable row level security;
alter table public.patient_photos enable row level security;
revoke all on public.photo_consents, public.patient_photos from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.give_photo_consent(boolean, text)',
    'public.record_photo_consent(uuid, boolean, text)',
    'public.withdraw_photo_consent(uuid)',
    'public.add_patient_photo(uuid, text, text, date, text, boolean)',
    'public.set_photo_shared(uuid, boolean)',
    'public.delete_patient_photo(uuid)',
    'public.patient_photos_for(uuid)',
    'public.my_photos()',
    'public.photo_can_upload(text)',
    'public.photo_can_read(text)',
    'public.photo_can_remove(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.has_photo_consent(uuid) from public, anon, authenticated;
revoke execute on function public.photo_consent_json(uuid) from public, anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  008_stage8_payments.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 8: payments, receipts and reports
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 007. Safe to run more than once.
--
-- What this file sets up
--   payments          one row per payment, each with its own receipt number
--   receipt_counters  the running receipt number for each financial year
-- Rules enforced by the database
--   * Only an administrator can record a payment taken at the desk, or a refund.
--   * A patient sees only their own payments and receipts.
--   * Doctors do not see payments.
--   * Receipt numbers run 0001, 0002, 0003 ... inside each financial year
--     (April to March) with no gaps, and are never reused.
--   * A paid payment can never be edited or deleted. A mistake is corrected
--     by marking it refunded, with a reason. The receipt stays on record.
--   * For online payments the amount is worked out by the database from the
--     service price. The patient's browser cannot change it. A payment is
--     marked paid only by the clinic's server after Razorpay confirms it.
--   * Online payment is OFF until an administrator switches it on.
-- =====================================================================

-- ---------- 1. Tables -------------------------------------------------
do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

create table if not exists public.receipt_counters (
  financial_year text primary key,          -- for example 2026-27
  last_no        integer not null
);

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.profiles (user_id) on delete restrict,
  appointment_id      uuid references public.appointments (id) on delete restrict,
  amount_inr          integer not null check (amount_inr between 1 and 500000),
  method              text not null check (method in ('cash', 'upi', 'card', 'online')),
  status              public.payment_status not null default 'pending',
  description         text not null check (char_length(btrim(description)) between 2 and 200),
  receipt_no          text unique,                      -- set at the moment the payment becomes paid
  paid_at             timestamptz,
  recorded_by         uuid references public.profiles (user_id) on delete set null,
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  refunded_at         timestamptz,
  refunded_by         uuid references public.profiles (user_id) on delete set null,
  refund_reason       text check (char_length(refund_reason) <= 300),
  created_at          timestamptz not null default now(),
  check ((status in ('paid', 'refunded')) = (receipt_no is not null and paid_at is not null)),
  check ((status = 'refunded') = (refunded_at is not null))
);
create index if not exists payments_patient_idx on public.payments (patient_id, paid_at desc);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists payments_appointment_idx on public.payments (appointment_id);

alter table public.clinic_settings add column if not exists online_payments boolean not null default false;

-- Money records do not change after the fact.
create or replace function public.payment_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'LOCKED: payments are never deleted. Mark the payment refunded instead';
  end if;
  if new.patient_id <> old.patient_id or new.amount_inr <> old.amount_inr
     or new.appointment_id is distinct from old.appointment_id or new.created_at <> old.created_at
     or new.method <> old.method
     or (old.receipt_no is not null and new.receipt_no is distinct from old.receipt_no)
     or (old.paid_at is not null and new.paid_at is distinct from old.paid_at) then
    raise exception 'LOCKED: the details of a payment cannot be changed';
  end if;
  if not (   (old.status = 'pending' and new.status in ('pending', 'paid', 'failed'))
          or (old.status = 'failed'  and new.status in ('failed', 'paid'))   -- a late confirmation from Razorpay
          or (old.status = 'paid'    and new.status in ('paid', 'refunded'))
          or (old.status = new.status)) then
    raise exception 'LOCKED: a payment cannot go from % to %', old.status, new.status;
  end if;
  if old.status = 'refunded' and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'LOCKED: a refunded payment cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists payments_lock on public.payments;
create trigger payments_lock before update or delete on public.payments
  for each row execute function public.payment_lock();

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row();

-- ---------- 2. Receipt numbers --------------------------------------------
-- The next number for the financial year of "now" in the clinic's timezone.
-- It runs inside the same step that marks the payment paid, so if that step
-- fails the number is not used up: there are never gaps.
create or replace function public.next_receipt_no()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
  v_start integer;
  v_fy    text;
  v_no    integer;
begin
  select (now() at time zone timezone)::date into v_today from public.clinic_settings limit 1;
  v_start := extract(year from v_today)::integer - case when extract(month from v_today) < 4 then 1 else 0 end;
  v_fy := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  insert into public.receipt_counters as c (financial_year, last_no) values (v_fy, 1)
  on conflict (financial_year) do update set last_no = c.last_no + 1
  returning last_no into v_no;
  return v_fy || '/' || lpad(v_no::text, 4, '0');
end $$;

-- ---------- 3. Admin: payment taken at the desk ---------------------------
create or replace function public.record_desk_payment(
  p_patient_id uuid, p_amount_inr integer, p_method text, p_description text default null,
  p_appointment_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  ap     public.appointments%rowtype;
  v_id   uuid;
  v_no   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can record a payment';
  end if;
  if p_method is null or p_method not in ('cash', 'upi', 'card') then
    raise exception 'INVALID_METHOD: choose cash, UPI or card';
  end if;
  if p_amount_inr is null or p_amount_inr < 1 or p_amount_inr > 500000 then
    raise exception 'INVALID_AMOUNT: enter an amount from 1 to 5,00,000 rupees';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_patient_id and role = 'patient') then
    raise exception 'NO_PATIENT: choose a registered patient';
  end if;

  if p_appointment_id is not null then
    -- Locking the appointment makes two payments for it wait their turn.
    select * into ap from public.appointments where id = p_appointment_id for update;
    if not found or ap.patient_id <> p_patient_id then
      raise exception 'WRONG_APPOINTMENT: that appointment belongs to a different patient';
    end if;
    if ap.status not in ('booked', 'completed') then
      raise exception 'NOT_BILLABLE: that appointment was cancelled or missed';
    end if;
    if exists (select 1 from public.payments where appointment_id = p_appointment_id and status = 'paid') then
      raise exception 'ALREADY_PAID: this appointment has already been paid for';
    end if;
    if v_desc is null then
      select s.name into v_desc from public.services s where s.id = ap.service_id;
    end if;
  end if;
  if v_desc is null or char_length(v_desc) < 2 then
    raise exception 'INVALID_DESCRIPTION: say what the payment is for';
  end if;

  v_no := public.next_receipt_no();
  insert into public.payments (patient_id, appointment_id, amount_inr, method, status, description, receipt_no, paid_at, recorded_by)
  values (p_patient_id, p_appointment_id, p_amount_inr, p_method, 'paid', left(v_desc, 200), v_no, now(), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'receipt_no', v_no);
end $$;

-- Marks a payment as refunded. This records that the money went back; the
-- money itself is returned by hand (cash) or from the Razorpay dashboard (online).
create or replace function public.refund_payment(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can record a refund';
  end if;
  select * into pay from public.payments where id = p_id for update;
  if not found or pay.status <> 'paid' then
    raise exception 'NOT_PAID: only a paid payment can be refunded';
  end if;
  if v_reason is null then raise exception 'REASON_REQUIRED: say why the payment is refunded'; end if;
  update public.payments
     set status = 'refunded', refunded_at = now(), refunded_by = auth.uid(), refund_reason = v_reason
   where id = p_id;
end $$;

-- The appointments of one day with what has and has not been paid.
create or replace function public.appointments_to_bill(p_date date)
returns table (appointment_id uuid, starts_at timestamptz, patient_id uuid, patient_name text,
               doctor_name text, service_name text, price_inr integer, status public.appointment_status,
               payment_id uuid, receipt_no text, paid_inr integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can see billing';
  end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  return query
    select a.id, a.starts_at, a.patient_id, p.full_name, d.full_name, s.name, s.price_inr, a.status,
           pay.id, pay.receipt_no, pay.amount_inr
      from public.appointments a
      join public.profiles p on p.user_id = a.patient_id
      join public.doctors d on d.id = a.doctor_id
      join public.services s on s.id = a.service_id
      left join lateral (select y.id, y.receipt_no, y.amount_inr from public.payments y
                          where y.appointment_id = a.id and y.status = 'paid'
                          order by y.paid_at limit 1) pay on true
     where (a.starts_at at time zone v_tz)::date = p_date and a.status in ('booked', 'completed')
     order by a.starts_at;
end $$;

-- Every payment received in a period, for the payment list and the revenue summary.
create or replace function public.list_payments(p_from date, p_to date)
returns table (id uuid, receipt_no text, paid_at timestamptz, paid_on date, patient_id uuid, patient_name text,
               patient_phone text, amount_inr integer, method text, status public.payment_status, description text,
               doctor_name text, appointment_id uuid, recorded_by_name text, refunded_at timestamptz, refund_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can see payments';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'INVALID_RANGE: choose a period of up to one year';
  end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  return query
    select y.id, y.receipt_no, y.paid_at, (y.paid_at at time zone v_tz)::date, y.patient_id, p.full_name, p.phone,
           y.amount_inr, y.method, y.status, y.description, d.full_name, y.appointment_id, r.full_name,
           y.refunded_at, y.refund_reason
      from public.payments y
      join public.profiles p on p.user_id = y.patient_id
      left join public.appointments a on a.id = y.appointment_id
      left join public.doctors d on d.id = a.doctor_id
      left join public.profiles r on r.user_id = y.recorded_by
     where y.status in ('paid', 'refunded')
       and (y.paid_at at time zone v_tz)::date between p_from and p_to
     order by y.paid_at desc;
end $$;

create or replace function public.set_online_payments(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can change this';
  end if;
  update public.clinic_settings set online_payments = coalesce(p_on, false) where id;
end $$;

-- ---------- 4. Patient: own receipts, and what is still to pay ------------
create or replace function public.my_payments()
returns table (id uuid, receipt_no text, paid_at timestamptz, amount_inr integer, method text,
               status public.payment_status, description text, doctor_name text, refunded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return query
    select y.id, y.receipt_no, y.paid_at, y.amount_inr, y.method, y.status, y.description, d.full_name, y.refunded_at
      from public.payments y
      left join public.appointments a on a.id = y.appointment_id
      left join public.doctors d on d.id = a.doctor_id
     where y.patient_id = auth.uid() and y.status in ('paid', 'refunded')
     order by y.paid_at desc;
end $$;

create or replace function public.my_unpaid_appointments()
returns table (appointment_id uuid, starts_at timestamptz, doctor_name text, service_name text, price_inr integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return query
    select a.id, a.starts_at, d.full_name, s.name, s.price_inr
      from public.appointments a
      join public.doctors d on d.id = a.doctor_id
      join public.services s on s.id = a.service_id
     where a.patient_id = auth.uid() and a.status = 'booked' and a.ends_at > now() and s.price_inr > 0
       and not exists (select 1 from public.payments y where y.appointment_id = a.id and y.status = 'paid')
     order by a.starts_at;
end $$;

-- ---------- 5. Online payment (Razorpay) ----------------------------------
-- Step 1, called for the signed-in patient: works out the amount and opens a
-- pending payment. The amount comes from the service price, never from the browser.
create or replace function public.start_online_payment(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ap      public.appointments%rowtype;
  v_price integer;
  v_name  text;
  v_id    uuid;
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can pay online';
  end if;
  if not (select online_payments from public.clinic_settings limit 1) then
    raise exception 'ONLINE_OFF: online payment is not available. Please pay at the clinic';
  end if;
  select * into ap from public.appointments where id = p_appointment_id for update;
  if not found or ap.patient_id <> auth.uid() then
    raise exception 'NOT_ALLOWED: you can only pay for your own appointment';
  end if;
  if ap.status <> 'booked' or ap.ends_at <= now() then
    raise exception 'NOT_PAYABLE: this appointment can no longer be paid for online';
  end if;
  if exists (select 1 from public.payments where appointment_id = ap.id and status = 'paid') then
    raise exception 'ALREADY_PAID: this appointment has already been paid for';
  end if;
  select s.price_inr, s.name into v_price, v_name from public.services s where s.id = ap.service_id;
  if coalesce(v_price, 0) < 1 then
    raise exception 'NOTHING_TO_PAY: there is no fee to pay for this appointment';
  end if;
  -- An earlier attempt that was never finished is closed.
  update public.payments set status = 'failed'
   where appointment_id = ap.id and status = 'pending' and method = 'online';
  insert into public.payments (patient_id, appointment_id, amount_inr, method, status, description, recorded_by)
  values (auth.uid(), ap.id, v_price, 'online', 'pending', v_name, auth.uid())
  returning id into v_id;
  return jsonb_build_object('payment_id', v_id, 'amount_inr', v_price, 'description', v_name);
end $$;

-- Steps 2 and 3 are called ONLY by the clinic's server function, which holds
-- the Razorpay secret. Nobody signed in to the app can call them.
create or replace function public.attach_razorpay_order(p_payment_id uuid, p_order_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set razorpay_order_id = p_order_id
   where id = p_payment_id and status = 'pending' and method = 'online' and razorpay_order_id is null;
  if not found then raise exception 'NOT_PENDING: that payment is not waiting for an order'; end if;
end $$;

create or replace function public.confirm_online_payment(p_order_id text, p_razorpay_payment_id text, p_amount_paise integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  pay  public.payments%rowtype;
  v_no text;
begin
  select * into pay from public.payments where razorpay_order_id = p_order_id for update;
  if not found then raise exception 'UNKNOWN_ORDER: no payment was started for that order'; end if;
  if pay.status in ('paid', 'refunded') then return pay.receipt_no; end if;   -- already confirmed: do nothing twice
  if p_amount_paise is distinct from pay.amount_inr * 100 then
    raise exception 'AMOUNT_MISMATCH: the amount paid does not match the fee';
  end if;
  v_no := public.next_receipt_no();
  -- A payment closed as "failed" (the patient started again) that then did go through is still recorded.
  update public.payments
     set status = 'paid', paid_at = now(), receipt_no = v_no, razorpay_payment_id = p_razorpay_payment_id
   where id = pay.id;
  return v_no;
end $$;

-- ---------- 6. Row Level Security and permissions ------------------------
-- No policies: both tables are reached only through the functions above.
alter table public.payments         enable row level security;
alter table public.receipt_counters enable row level security;
revoke all on public.payments, public.receipt_counters from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.record_desk_payment(uuid, integer, text, text, uuid)',
    'public.refund_payment(uuid, text)',
    'public.appointments_to_bill(date)',
    'public.list_payments(date, date)',
    'public.set_online_payments(boolean)',
    'public.my_payments()',
    'public.my_unpaid_appointments()',
    'public.start_online_payment(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.attach_razorpay_order(uuid, text)',
    'public.confirm_online_payment(text, text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke execute on function public.next_receipt_no() from public, anon, authenticated;
revoke execute on function public.payment_lock() from public, anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  009_stage9_hardening.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 9: final tightening
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 008. Safe to run more than once.
--
-- A new Supabase project hands out some permissions by default. The earlier
-- files already close everything that matters. This file closes the last few
-- harmless leftovers, so that a visitor who is not signed in can run nothing
-- at all and can only read the clinic's public information.
-- =====================================================================

-- Visitors who are not signed in may not run any function.
revoke execute on all functions in schema public from anon;

-- Two internal helpers that no signed-in person needs to call directly.
revoke execute on function public.touch_updated_at() from public, authenticated;
revoke execute on function public.photo_patient(text) from public, authenticated;

-- Internal counters used by the access log.
revoke all on all sequences in schema public from anon, authenticated;

-- Anything created later in this schema starts closed to visitors as well.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on sequences from anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  010_desk_registration.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  011_patient_pin_login.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
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
-- The desk's server function first asks the database for a one-time pass
-- (a long random value, valid for 10 minutes), then creates the login with
-- that pass attached. The database turns that login into a patient only if
-- the pass is genuine and unused. Nobody else can obtain a pass: only the
-- server function may ask for one. Anything else keeps the old rules: a phone
-- sign-up is a patient, an email sign-up needs a staff invitation.
create table if not exists public.desk_signup_passes (
  pass          text primary key,
  contact_phone text,
  created_at    timestamptz not null default now(),
  used_at       timestamptz
);
alter table public.desk_signup_passes enable row level security;
revoke all on public.desk_signup_passes from anon, authenticated;

create or replace function public.desk_signup_pass(p_contact_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_pass text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  delete from public.desk_signup_passes where created_at < now() - interval '1 day';
  insert into public.desk_signup_passes (pass, contact_phone)
  values (v_pass, nullif(btrim(coalesce(p_contact_phone, '')), ''));
  return v_pass;
end $$;
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv  public.staff_invites%rowtype;
  v_ticket public.desk_signup_passes%rowtype;
begin
  if coalesce(new.raw_user_meta_data ->> 'desk_pass', '') <> '' then
    update public.desk_signup_passes d
       set used_at = now()
     where d.pass = new.raw_user_meta_data ->> 'desk_pass'
       and d.used_at is null and d.created_at > now() - interval '10 minutes'
    returning d.* into v_ticket;
    if not found then
      raise exception 'DESK_PASS_INVALID: this registration was not started by the clinic';
    end if;
    insert into public.profiles (user_id, role, phone) values (new.id, 'patient', v_ticket.contact_phone);
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
revoke execute on function public.desk_signup_pass(text) from public, anon, authenticated;
grant execute on function public.desk_signup_pass(text) to service_role;
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  012_upi_qr.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Dr. Sonawane Clinic App  ·  UPI payments by QR code (free, no payment company)
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 011. Safe to run more than once.
--
-- How it works
--   * The administrator saves the clinic's UPI ID (for example
--     drsonawane@okaxis) in Admin > Payments.
--   * At the desk, choosing "UPI" shows a QR code with the exact amount.
--     The patient scans it with any UPI app (PhonePe, Google Pay, Paytm,
--     BHIM). The money goes straight to the clinic's bank account. No fee.
--   * Patients can also see the QR for an unpaid appointment in their portal.
--   * The app cannot see the clinic's bank account, so it cannot tell by
--     itself that money arrived. The desk checks the clinic's own UPI app or
--     bank SMS, then saves the payment. Only then is a receipt issued.
--   * The UPI reference number (UTR) can be saved with the payment, so the
--     accountant can match it with the bank statement.
-- =====================================================================

-- ---------- 1. The clinic's UPI details ------------------------------------
alter table public.clinic_settings add column if not exists upi_id text;
alter table public.clinic_settings add column if not exists upi_payee_name text;

do $$ begin
  alter table public.clinic_settings add constraint clinic_settings_upi check (
    (upi_id is null or upi_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z][A-Za-z0-9]{1,63}$')
    and (upi_payee_name is null or char_length(btrim(upi_payee_name)) between 2 and 60)
  );
exception when duplicate_object then null;
end $$;

-- Only through this function: admin only, checked, and written to the access log.
create or replace function public.set_upi_details(p_upi_id text, p_payee_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id   text := nullif(lower(btrim(coalesce(p_upi_id, ''))), '');
  v_name text := nullif(btrim(coalesce(p_payee_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can change this';
  end if;
  if v_id is not null and v_id !~ '^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$' then
    raise exception 'INVALID_UPI_ID: a UPI ID looks like name@bank, for example drsonawane@okaxis';
  end if;
  if v_id is not null and (v_name is null or char_length(v_name) not between 2 and 60) then
    raise exception 'INVALID_PAYEE_NAME: enter the name the bank shows for this UPI ID';
  end if;
  -- "where id" is needed: Supabase refuses an UPDATE without a WHERE when it comes from the app.
  update public.clinic_settings set upi_id = v_id, upi_payee_name = case when v_id is null then null else v_name end where id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
  values (auth.uid(), 'admin', 'update', 'clinic_settings', 'upi_id', null);
end $$;

-- ---------- 2. UPI reference number on a payment ----------------------------
alter table public.payments add column if not exists upi_ref text;
do $$ begin
  alter table public.payments add constraint payments_upi_ref check (
    upi_ref is null or (method = 'upi' and upi_ref ~ '^[A-Za-z0-9]{6,35}$')
  );
exception when duplicate_object then null;
end $$;

-- Same lock as before, now also covering the UPI reference.
create or replace function public.payment_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'LOCKED: payments are never deleted. Mark the payment refunded instead';
  end if;
  if new.patient_id <> old.patient_id or new.amount_inr <> old.amount_inr
     or new.appointment_id is distinct from old.appointment_id or new.created_at <> old.created_at
     or new.method <> old.method or new.upi_ref is distinct from old.upi_ref
     or (old.receipt_no is not null and new.receipt_no is distinct from old.receipt_no)
     or (old.paid_at is not null and new.paid_at is distinct from old.paid_at) then
    raise exception 'LOCKED: the details of a payment cannot be changed';
  end if;
  if not (   (old.status = 'pending' and new.status in ('pending', 'paid', 'failed'))
          or (old.status = 'failed'  and new.status in ('failed', 'paid'))   -- a late confirmation from Razorpay
          or (old.status = 'paid'    and new.status in ('paid', 'refunded'))
          or (old.status = new.status)) then
    raise exception 'LOCKED: a payment cannot go from % to %', old.status, new.status;
  end if;
  if old.status = 'refunded' and to_jsonb(new) <> to_jsonb(old) then
    raise exception 'LOCKED: a refunded payment cannot be changed';
  end if;
  return new;
end $$;

-- ---------- 3. Desk payment, now with the optional UPI reference -------------
-- The old version (five inputs) is replaced, so there is only one way in.
drop function if exists public.record_desk_payment(uuid, integer, text, text, uuid);

create or replace function public.record_desk_payment(
  p_patient_id uuid, p_amount_inr integer, p_method text, p_description text default null,
  p_appointment_id uuid default null, p_upi_ref text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_ref  text := nullif(upper(regexp_replace(coalesce(p_upi_ref, ''), '\s', '', 'g')), '');
  ap     public.appointments%rowtype;
  v_id   uuid;
  v_no   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can record a payment';
  end if;
  if p_method is null or p_method not in ('cash', 'upi', 'card') then
    raise exception 'INVALID_METHOD: choose cash, UPI or card';
  end if;
  if p_amount_inr is null or p_amount_inr < 1 or p_amount_inr > 500000 then
    raise exception 'INVALID_AMOUNT: enter an amount from 1 to 5,00,000 rupees';
  end if;
  if v_ref is not null and (p_method <> 'upi' or v_ref !~ '^[A-Z0-9]{6,35}$') then
    raise exception 'INVALID_UPI_REF: the UPI reference number is the 12-digit number in the payment message. Leave it empty if you do not have it';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_patient_id and role = 'patient') then
    raise exception 'NO_PATIENT: choose a registered patient';
  end if;

  if p_appointment_id is not null then
    -- Locking the appointment makes two payments for it wait their turn.
    select * into ap from public.appointments where id = p_appointment_id for update;
    if not found or ap.patient_id <> p_patient_id then
      raise exception 'WRONG_APPOINTMENT: that appointment belongs to a different patient';
    end if;
    if ap.status not in ('booked', 'completed') then
      raise exception 'NOT_BILLABLE: that appointment was cancelled or missed';
    end if;
    if exists (select 1 from public.payments where appointment_id = p_appointment_id and status = 'paid') then
      raise exception 'ALREADY_PAID: this appointment has already been paid for';
    end if;
    if v_desc is null then
      select s.name into v_desc from public.services s where s.id = ap.service_id;
    end if;
  end if;
  if v_desc is null or char_length(v_desc) < 2 then
    raise exception 'INVALID_DESCRIPTION: say what the payment is for';
  end if;
  -- The same UPI reference cannot be used for two receipts.
  if v_ref is not null and exists (select 1 from public.payments where upi_ref = v_ref) then
    raise exception 'UPI_REF_USED: this UPI reference number is already on another receipt';
  end if;

  v_no := public.next_receipt_no();
  insert into public.payments (patient_id, appointment_id, amount_inr, method, status, description, receipt_no, paid_at, recorded_by, upi_ref)
  values (p_patient_id, p_appointment_id, p_amount_inr, p_method, 'paid', left(v_desc, 200), v_no, now(), auth.uid(), v_ref)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'receipt_no', v_no);
end $$;

create unique index if not exists payments_upi_ref_idx on public.payments (upi_ref) where upi_ref is not null;

-- ---------- 4. Lists now include the UPI reference -------------------------
drop function if exists public.list_payments(date, date);
create function public.list_payments(p_from date, p_to date)
returns table (id uuid, receipt_no text, paid_at timestamptz, paid_on date, patient_id uuid, patient_name text,
               patient_phone text, amount_inr integer, method text, status public.payment_status, description text,
               doctor_name text, appointment_id uuid, recorded_by_name text, refunded_at timestamptz, refund_reason text,
               upi_ref text)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can see payments';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'INVALID_RANGE: choose a period of up to one year';
  end if;
  select timezone into v_tz from public.clinic_settings limit 1;
  return query
    select y.id, y.receipt_no, y.paid_at, (y.paid_at at time zone v_tz)::date, y.patient_id, p.full_name, p.phone,
           y.amount_inr, y.method, y.status, y.description, d.full_name, y.appointment_id, r.full_name,
           y.refunded_at, y.refund_reason, y.upi_ref
      from public.payments y
      join public.profiles p on p.user_id = y.patient_id
      left join public.appointments a on a.id = y.appointment_id
      left join public.doctors d on d.id = a.doctor_id
      left join public.profiles r on r.user_id = y.recorded_by
     where y.status in ('paid', 'refunded')
       and (y.paid_at at time zone v_tz)::date between p_from and p_to
     order by y.paid_at desc;
end $$;

drop function if exists public.my_payments();
create function public.my_payments()
returns table (id uuid, receipt_no text, paid_at timestamptz, amount_inr integer, method text,
               status public.payment_status, description text, doctor_name text, refunded_at timestamptz,
               upi_ref text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then
    raise exception 'NOT_ALLOWED: only a signed-in patient can do this';
  end if;
  return query
    select y.id, y.receipt_no, y.paid_at, y.amount_inr, y.method, y.status, y.description, d.full_name, y.refunded_at, y.upi_ref
      from public.payments y
      left join public.appointments a on a.id = y.appointment_id
      left join public.doctors d on d.id = a.doctor_id
     where y.patient_id = auth.uid() and y.status in ('paid', 'refunded')
     order by y.paid_at desc;
end $$;

-- ---------- 5. Permissions -------------------------------------------------
-- The UPI columns are changed only through set_upi_details, never directly.
revoke update (upi_id, upi_payee_name) on public.clinic_settings from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_upi_details(text, text)',
    'public.record_desk_payment(uuid, integer, text, text, uuid, text)',
    'public.list_payments(date, date)',
    'public.my_payments()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ---------- 6. Fix: the online payment switch ------------------------------
-- Same "where" fix for the switch from Stage 8.
create or replace function public.set_online_payments(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: only an administrator can change this';
  end if;
  update public.clinic_settings set online_payments = coalesce(p_on, false) where id;
end $$;

-- Ask the website to reload its view of the database straight away.
notify pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  CLEAN START  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- A real clinic must not open with made-up entries. This removes them:
--   * the sample holiday
--   * the three placeholder doctors ("name to be added")
--   * the five sample procedures with made-up prices
-- It keeps the two confirmed fees: Skin consultation Rs. 300 and Follow-up
-- consultation Rs. 200. Add the real doctors and services in the Admin portal.
-- It never removes anything that is in use, or that you have already changed.
delete from public.holidays where reason like '%(sample entry)%';

delete from public.doctors d
 where d.full_name like '%(name to be added)%' and d.profile_id is null
   and not exists (select 1 from public.appointments a where a.doctor_id = d.id)
   and not exists (select 1 from public.staff_invites i where i.doctor_id = d.id);

delete from public.services s
 where (s.name, s.price_inr) in (('Acne treatment review', 300), ('Hair and scalp consultation', 300),
                                 ('Chemical peel', 1500), ('Laser hair reduction', 2500), ('Wart or mole removal', 1000))
   and not exists (select 1 from public.profiles p where p.role = 'patient')
   and not exists (select 1 from public.appointments a where a.service_id = s.id);
