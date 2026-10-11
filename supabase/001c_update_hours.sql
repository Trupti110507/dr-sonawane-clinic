-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 1 update: new clinic hours
-- Morning 11:00 am to 3:00 pm, afternoon 5:30 pm to 9:00 pm.
-- Run this ONLY if you ran 001_stage1_clinic_setup.sql before the hours
-- were changed. Where: Supabase dashboard > SQL Editor > New query > Run.
-- Safe to run more than once.
-- =====================================================================
update public.working_hours
   set opens_at = '11:00', closes_at = '21:00', break_start = '15:00', break_end = '17:30'
 where not is_closed;

-- Check the result
select weekday, is_closed, opens_at, break_start, break_end, closes_at
  from public.working_hours order by weekday;
