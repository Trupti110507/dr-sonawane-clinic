# Patient sign-in: patient number and PIN

Built for a rural clinic. It costs nothing, and needs no SMS, no DLT
registration, no email and no Google account.

## How it works for the patient

1. **At the clinic desk**, the receptionist registers the patient (Admin >
   Patients > Register a patient) and prints or writes out a **slip** with:
   - the **patient number**, for example 1004. It never changes.
   - a one-time **setup code**, for example 493027. It works once, for 7 days.
2. **At home, on their phone**, the patient opens the website > **Sign in** >
   **Patient** > **First time or forgot PIN?**, types the patient number and the
   setup code, and chooses their own **6-digit PIN**, like an ATM PIN.
3. **Every time after:** patient number and PIN. The phone stays signed in, so
   most patients only do this once.
4. **Forgot the PIN?** The desk clicks **New setup code** next to the patient's
   name and gives a new slip. Their records are untouched.

Patients who never use the website lose nothing. The desk can book, bill and
treat them exactly the same.

## Why it suits rural patients

- **Family members can share one phone.** The login is the patient number, not
  the mobile number, so a mother, a child and a grandparent can each have their
  own number and PIN on the same phone. The mobile number is just for contacting them.
- **Patients with no phone** can still be registered; leave the mobile number empty.
- **Numbers only.** The phone shows the number keypad; there is nothing to spell.
- **Nothing to remember except a 6-digit PIN**, and the slip carries the rest.

## How it stays safe

| Protection | What it means |
| --- | --- |
| The first PIN needs a code handed over in person | Nobody can claim a patient's record from home |
| PINs are stored only as a one-way scramble | Nobody, not even the clinic, can read a PIN |
| 5 wrong tries lock that patient's sign-in for 30 minutes | A PIN cannot be guessed one try after another |
| 40 wrong tries across the whole website in 15 minutes pause all PIN sign-ins for 15 minutes | Stops someone trying one PIN against many patient numbers |
| A wrong patient number and a wrong PIN give the same message | Patient numbers cannot be checked one by one |
| Easy PINs (111111, 123456, 654321 and so on) are refused | |
| Only an administrator can issue setup codes, and each one is in the access log | |
| The check runs only on the clinic's server | The website itself never sees a stored PIN |

**One thing to be aware of:** if many wrong tries happen at once, the 15-minute
pause applies to everyone. That is the price of stopping mass guessing. Staff
sign-in is not affected.

## Setup (development project first, then production)

### Step 1: database

Supabase > **SQL Editor**. Run these, in this order, each in a new query:

1. `supabase/010_desk_registration.sql` (skip if you already ran it)
2. `supabase/011_patient_pin_login.sql`

A new production project gets both from `PRODUCTION_setup_all_in_one.sql`.

### Step 2: update the registration function

The `register-patient` function has changed. Supabase > **Edge Functions** >
`register-patient` > open its code > select all, delete, paste the whole of
`supabase/functions/register-patient/index.ts` > **Deploy**. Verify JWT stays **on**.

(If you have not created it yet, create it as described in `DESK-REGISTRATION-GUIDE.md`.)

### Step 3: add the sign-in function

Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**.

- Name it exactly `patient-login`.
- Paste the whole of `supabase/functions/patient-login/index.ts`.
- Switch **Verify JWT** **off** for this one. The patient is not signed in yet
  when they use it; the function checks the PIN itself.
- **Deploy.** No secrets are needed.

### Step 4: publish

```
git add .
git commit -m "Patient sign-in with patient number and PIN"
git push
```

### Step 5: try it

Use a made-up patient.

- [ ] Admin > Patients > **Register a patient**, with no mobile number. A slip
      appears with a patient number and a setup code.
- [ ] Register a second made-up person with the **same** mobile number as an
      existing patient: the form asks you to confirm a family member, then gives
      them their own number.
- [ ] On a phone (or a private browser window): **Sign in** > **Patient** >
      **First time or forgot PIN?** Enter the number, the code and a PIN such as
      `583920`. You land in the patient portal.
- [ ] Sign out and sign in again with the number and PIN.
- [ ] Type a wrong PIN 5 times: the sixth try says it is locked.
- [ ] Admin > Patients: the list shows "PIN set" for that patient.
      **New setup code** gives a new slip; using it sets a new PIN.
- [ ] Admin > Access log shows "added a sign-in setup code".

**What I could not test.** The database rules passed 46 checks and the screens
22 browser checks. The two server functions passed 30 checks against a
simulated Supabase. They have not run against real Supabase sign-in, so Step 5
is their first real run. If something fails, open Edge Functions >
`patient-login` (or `register-patient`) > **Logs** and send me a screenshot.

## SMS codes

SMS sign-in is now **switched off** for patients, so the clinic does not need
DLT registration or an SMS provider at all. If the clinic sets up SMS later,
it can be offered as a second way to sign in: tell me and I will add the switch
to the Admin portal.
