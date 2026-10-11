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
