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
  update public.clinic_settings set online_payments = coalesce(p_on, false);
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
