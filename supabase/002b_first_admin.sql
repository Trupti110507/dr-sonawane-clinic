-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 2: invite the FIRST administrator
-- Run this ONCE, after 002_stage2_accounts_roles.sql.
-- 1. Replace the email and name below with your own.
-- 2. Run it in Supabase > SQL Editor.
-- 3. Open the app > Sign in > Clinic staff > "First time? Activate your account".
-- Every later doctor or admin is invited from the Admin portal, not here.
-- =====================================================================
insert into public.staff_invites (email, role, full_name)
values ('trupti@gmail.com', 'admin', 'Trupti Panagvhane')
on conflict (email) do nothing;

select email, role, full_name, accepted_at from public.staff_invites;
