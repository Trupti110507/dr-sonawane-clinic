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
