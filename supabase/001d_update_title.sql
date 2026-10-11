-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 1 update: new title and subheadings
-- Run this ONLY if you ran 001_stage1_clinic_setup.sql before the title
-- was changed. Where: Supabase dashboard > SQL Editor > New query > Run.
-- Safe to run more than once.
-- =====================================================================
alter table public.clinic_settings add column if not exists subtitle text;

update public.clinic_settings
   set name     = 'Dr. Sonawane',
       tagline  = 'Dermatologist and Venereologist',
       subtitle = 'Skin, Hair, Cosmetic & Laser Clinic';

-- Check the result
select name, tagline, subtitle from public.clinic_settings;
