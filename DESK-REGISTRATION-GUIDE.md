# Registering a patient at the front desk

## What this adds

Admin > **Patients** > **Register a patient**. The administrator types the
patient's name and mobile number (twice, to catch mistakes), and optionally the
date of birth and gender. From that moment the clinic can book appointments and
take payments for the patient, and the doctor can write notes.

The patient can later sign in on their own phone with the same mobile number
and SMS code, and will find everything already there.

## Rules

- Only an administrator can register a patient. A doctor or patient cannot.
- The administrator enters contact details only, never medical information.
- The administrator must tick that the patient was told how the clinic uses
  their information and agreed. Who registered the patient is saved and logged.
- A mobile number can belong to only one patient record.

**Take care with the number.** Whoever holds that phone can sign in and see that
patient's record. If a wrong number was registered, open Admin > Patients, click
**Deactivate** on that entry, and register the patient again with the right number.

**One number per family?** Two family members cannot share one mobile number in
the app. Each needs a different number.

## Setup (once per Supabase project)

### Step 1: the database step

Supabase > **SQL Editor** > paste all of `supabase/010_desk_registration.sql` > **Run**.
(A new production project gets this from `PRODUCTION_setup_all_in_one.sql` already.)

### Step 2: the server function

1. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Name it exactly `register-patient`.
3. Delete the sample code. Open `supabase/functions/register-patient/index.ts`
   from this folder, copy everything, paste it in.
4. Leave **Verify JWT** switched **on** for this function.
5. Click **Deploy**. No secrets need to be added.

### Step 3: publish the screen

```
git add .
git commit -m "Front-desk patient registration"
git push
```

### Step 4: try it

Use a made-up name and a number that is not a real patient's, for example a
staff member's second phone.

- [ ] Admin > Patients > **Register a patient**. Type two different numbers:
      the form refuses.
- [ ] Register with the same number twice over: the second time says the number
      is already registered.
- [ ] After a successful registration the patient is in the list.
- [ ] Admin > Appointments: book for that patient. Admin > Payments: take a payment.
- [ ] Sign in as that patient on the phone (needs real SMS, or the test number in
      the development project): the appointment and receipt are there, and the
      welcome questions are skipped.
- [ ] Admin > Access log shows "added" for the patient.

**What I could not test.** The function passed 16 checks against a simulated
Supabase, and the database step and the form were tested. I could not run the
function against real Supabase sign-in, so Step 4 is the first real run. If the
form shows "The patient could not be registered", send me a screenshot, and
check Edge Functions > register-patient > Logs.
