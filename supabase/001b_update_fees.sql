-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 1 update: confirmed fees
-- Run this ONLY if you ran 001_stage1_clinic_setup.sql before the fees
-- were changed. Where: Supabase dashboard > SQL Editor > New query > Run.
-- Safe to run more than once, and harmless if nothing needs changing.
-- =====================================================================

-- Consultation fee Rs. 300 for every doctor
update public.doctors set consultation_fee_inr = 300;

-- Doctor names are not confirmed yet: show a placeholder
update public.doctors
   set full_name = 'Doctor 1 (name to be added)'
 where full_name = 'Dr. Sonawane' and qualification = 'Qualification to be added';

-- Consultations Rs. 300, follow-up Rs. 200
update public.services set price_inr = 300
 where name in ('Skin consultation', 'Acne treatment review', 'Hair and scalp consultation');
update public.services set price_inr = 200
 where name = 'Follow-up consultation';

-- Check the result
select name, price_inr from public.services order by sort_order;
