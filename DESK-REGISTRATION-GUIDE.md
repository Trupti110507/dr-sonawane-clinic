# Registering a patient at the front desk

Desk registration is now part of the patient sign-in set-up. Everything is in
`PATIENT-LOGIN-GUIDE.md`.

For the `register-patient` server function, the steps are:

1. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**
   (or open the existing `register-patient` function to replace its code).
2. Name it exactly `register-patient`.
3. Paste the whole of `supabase/functions/register-patient/index.ts`.
4. Leave **Verify JWT** switched **on**.
5. **Deploy.** No secrets are needed.

Take care with the patient's details: contact details only, never medical
information. If a patient was registered twice by mistake, deactivate the
duplicate in Admin > Patients.
