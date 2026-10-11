-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 1: clinic setup tables
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Safe to run more than once.
-- =====================================================================

-- ---------- 1. clinic_settings: exactly ONE row (single clinic) --------
create table if not exists public.clinic_settings (
  id                  boolean primary key default true check (id),  -- only "true" allowed => one row
  name                text    not null,
  tagline             text,
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
insert into public.clinic_settings (id, name, tagline, address, city, phone_primary, phone_secondary)
values (true,
        'Dr. Sonawane Skin Clinic',
        'Dermatology and skin care',
        'Besides Gajanan Maharaj Mandir, Vinchur Yeola Road',
        'Yeola',
        '+91 8928774097',
        '+91 7517301266')
on conflict (id) do nothing;

insert into public.working_hours (weekday, is_closed, opens_at, closes_at, break_start, break_end) values
  (0, true,  null,    null,    null,    null),      -- Sunday (assumed closed)
  (1, false, '09:00', '22:00', '15:00', '17:30'),
  (2, false, '09:00', '22:00', '15:00', '17:30'),
  (3, false, '09:00', '22:00', '15:00', '17:30'),
  (4, false, '09:00', '22:00', '15:00', '17:30'),
  (5, false, '09:00', '22:00', '15:00', '17:30'),
  (6, false, '09:00', '22:00', '15:00', '17:30')
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
