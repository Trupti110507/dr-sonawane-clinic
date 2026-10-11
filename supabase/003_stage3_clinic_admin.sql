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
