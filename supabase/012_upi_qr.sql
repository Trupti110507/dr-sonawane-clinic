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
