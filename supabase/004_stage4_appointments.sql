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
