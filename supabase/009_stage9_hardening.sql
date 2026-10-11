-- =====================================================================
-- Dr. Sonawane Clinic App  ·  Stage 9: final tightening
-- Where this goes: Supabase dashboard > SQL Editor > New query > paste > Run
-- Run AFTER files 001 to 008. Safe to run more than once.
--
-- A new Supabase project hands out some permissions by default. The earlier
-- files already close everything that matters. This file closes the last few
-- harmless leftovers, so that a visitor who is not signed in can run nothing
-- at all and can only read the clinic's public information.
-- =====================================================================

-- Visitors who are not signed in may not run any function.
revoke execute on all functions in schema public from anon;

-- Two internal helpers that no signed-in person needs to call directly.
revoke execute on function public.touch_updated_at() from public, authenticated;
revoke execute on function public.photo_patient(text) from public, authenticated;

-- Internal counters used by the access log.
revoke all on all sequences in schema public from anon, authenticated;

-- Anything created later in this schema starts closed to visitors as well.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
