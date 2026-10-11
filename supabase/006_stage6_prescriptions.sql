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
