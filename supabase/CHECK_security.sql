-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Security self-check
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- It changes NOTHING. It only looks, and prints one line per check.
--
-- How to read the result
--   OK     as it should be
--   FIX    must be put right before real patients use this project
--   NOTE   not a fault, but something to finish or be aware of
-- Run it on the production project before go-live, and again after any change.
-- =====================================================================
with checks(n, name, verdict, detail) as (

  select 1, 'Every table is protected by Row Level Security',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Unprotected: ' || string_agg(c.relname, ', '), 'All tables protected')
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  select 2, 'Visitors (not signed in) can read only public clinic information',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Visitors can reach: ' || string_agg(distinct g.table_name || ' (' || g.privilege_type || ')', ', '), 'Only clinic details, hours, holidays, services and doctors')
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'anon'
     and not (g.privilege_type = 'SELECT' and g.table_name in ('clinic_settings', 'working_hours', 'holidays', 'services', 'doctors'))

  union all
  select 3, 'Visitors (not signed in) cannot run any database function',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Visitors can run: ' || string_agg(p.proname, ', '), 'None')
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')

  union all
  select 4, 'Signed-in people cannot write to tables directly, except admin clinic settings',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Direct write allowed on: ' || string_agg(distinct g.table_name || ' (' || g.privilege_type || ')', ', '), 'All other changes go through checked functions')
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type <> 'SELECT'
     and not (g.table_name = 'holidays' and g.privilege_type in ('INSERT', 'DELETE'))
     and not (g.table_name = 'staff_invites' and g.privilege_type = 'DELETE')

  union all
  select 5, 'Patient photos, photo consent and payments cannot be read from tables directly',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Readable: ' || string_agg(distinct g.table_name, ', '), 'Reached only through checked functions')
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
     and g.table_name in ('patient_photos', 'photo_consents', 'payments', 'receipt_counters')

  union all
  select 6, 'Privileged functions are pinned so they cannot be tricked into using other code',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         coalesce('Not pinned: ' || string_agg(p.proname, ', '), 'All pinned')
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')

  union all
  select 7, 'The patient photo folder is private',
         case when bool_or(b.id = 'patient-photos' and not b.public) then 'OK' else 'FIX' end,
         case when bool_or(b.id = 'patient-photos' and not b.public) then 'Private' when bool_or(b.id = 'patient-photos') then 'It is PUBLIC. Run file 007 again' else 'Folder missing. Run file 007' end
    from storage.buckets b

  union all
  select 8, 'Only server code can mark an online payment as paid',
         case when not has_function_privilege('authenticated', 'public.confirm_online_payment(text, text, integer)', 'execute')
               and not has_function_privilege('authenticated', 'public.attach_razorpay_order(uuid, text)', 'execute') then 'OK' else 'FIX' end,
         'Signed-in people must not be able to confirm their own payments'

  union all
  select 21, 'Only server code can create a patient at the desk',
         case when to_regprocedure('public.desk_register_patient(uuid, text, date, text, uuid, boolean)') is null then 'NOTE'
              when has_function_privilege('authenticated', 'public.desk_register_patient(uuid, text, date, text, uuid, boolean)', 'execute') then 'FIX' else 'OK' end,
         case when to_regprocedure('public.desk_register_patient(uuid, text, date, text, uuid, boolean)') is null then 'File 010 has not been run, so the desk cannot register patients yet' else 'Reached only through the register-patient server function' end

  union all
  select 22, 'The clinic has at least one doctor and one service listed',
         case when (select count(*) from public.doctors where is_active) > 0 and (select count(*) from public.services where is_active) > 0 then 'OK' else 'NOTE' end,
         (select count(*) from public.doctors where is_active) || ' active doctor(s), ' || (select count(*) from public.services where is_active) || ' active service(s). Add them in the Admin portal'
  union all
  select 9, 'The access log cannot be edited or erased',
         case when count(*) >= 2 then 'OK' else 'FIX' end, count(*) || ' protective triggers on audit_log'
    from pg_trigger t where t.tgrelid = 'public.audit_log'::regclass and not t.tgisinternal

  union all
  select 10, 'Double-booking is blocked by the database',
         case when count(*) = 1 then 'OK' else 'FIX' end, 'Constraint appointments_no_double_booking'
    from pg_constraint where conname = 'appointments_no_double_booking'

  union all
  select 11, 'Approved prescriptions and saved payments are locked',
         case when count(*) = 3 then 'OK' else 'FIX' end, count(*) || ' of 3 lock triggers present'
    from pg_trigger t where t.tgname in ('prescriptions_lock', 'prescription_items_lock', 'payments_lock') and not t.tgisinternal

  union all
  select 12, 'There is exactly one clinic',
         case when count(*) = 1 then 'OK' else 'FIX' end, count(*) || ' row in clinic_settings'
    from public.clinic_settings

  union all
  select 13, 'At least one active administrator can sign in',
         case when count(*) >= 1 then 'OK' else 'FIX' end,
         count(*) || ' active administrator(s). Two is safer than one, in case one is locked out'
    from public.profiles where role = 'admin' and is_active

  union all
  select 14, 'No test patient account (mobile 98765 43210)',
         case when count(*) = 0 then 'OK' else 'FIX' end,
         case when count(*) = 0 then 'None found' else 'A test patient exists. Real projects must not contain it. Also remove the test number from Authentication > Phone' end
    from public.profiles where phone in ('919876543210', '+919876543210')

  union all
  select 15, 'Doctor names are filled in',
         case when count(*) = 0 then 'OK' else 'NOTE' end,
         case when count(*) = 0 then 'No placeholder names' else count(*) || ' doctor(s) still say "name to be added". Edit them in Admin > Doctors' end
    from public.doctors where is_active and (full_name ilike '%to be added%' or coalesce(qualification, '') ilike '%to be added%')

  union all
  select 16, 'Every listed doctor has a login',
         case when count(*) = 0 then 'OK' else 'NOTE' end,
         case when count(*) = 0 then 'All linked' else count(*) || ' active doctor(s) have no login yet. Invite them in Admin > Staff accounts and choose their listing' end
    from public.doctors where is_active and profile_id is null

  union all
  select 17, 'Doctors'' registration numbers are entered (printed on prescriptions)',
         case when count(*) = 0 then 'OK' else 'NOTE' end,
         count(*) || ' active doctor(s) without a registration number'
    from public.doctors where is_active and coalesce(btrim(registration_no), '') = ''

  union all
  select 18, 'Sample entries are removed',
         case when count(*) = 0 then 'OK' else 'NOTE' end,
         case when count(*) = 0 then 'None found' else 'A holiday marked "(sample entry)" is still listed. Remove it in Admin > Hours and holidays' end
    from public.holidays where reason ilike '%sample%'

  union all
  select 19, 'Staff invitations not yet used',
         case when count(*) = 0 then 'OK' else 'NOTE' end,
         case when count(*) = 0 then 'None waiting' else count(*) || ' invitation(s) waiting: ' || string_agg(email, ', ') || '. Cancel any that are no longer wanted' end
    from public.staff_invites where accepted_at is null

  union all
  select 20, 'Online payment switch',
         'NOTE', case when online_payments then 'ON. Make sure the Razorpay keys in Edge Functions > Secrets are the right ones (test or live) for this project'
                      else 'OFF. Patients pay at the clinic' end
    from public.clinic_settings
)
select n as "#", verdict as "Result", name as "Check", detail as "Detail"
  from checks order by case verdict when 'FIX' then 0 when 'NOTE' then 1 else 2 end, n;
