# Stage 9: final checks and go-live

This is the last stage. It has three parts:

- **Part 1:** finish the development project (10 minutes).
- **Part 2:** create the production project that real patients will use.
- **Part 3:** the go-live checklist.

Day-to-day running after go-live is in `HANDOVER.md`.

## What this stage adds

- `supabase/009_stage9_hardening.sql`: closes the last default permissions, so a
  visitor who is not signed in can run nothing and read only public clinic details.
- `supabase/CHECK_security.sql`: a self-check you paste into Supabase. It changes
  nothing and prints OK, FIX or NOTE for 20 checks.
- `supabase/PRODUCTION_setup_all_in_one.sql`: files 001 to 010 joined into one,
  for the new production project, with the sample entries removed.
- **Automatic sign-out for staff:** a doctor or administrator who does not use
  the app for 30 minutes is signed out. Patients on their own phones are not.
- **Browser security headers** (in `vercel.json`): the site cannot be placed
  inside another website, and its pages can talk only to Supabase and Razorpay.

## What was tested, and what was not

Tested here, on a test copy with made-up people:

- The whole database was built from empty, twice, the way a new Supabase project behaves.
- **Permission test, 138 checks:** every table and the key functions, tried as a
  visitor, two patients, two doctors and an administrator. Each person saw
  exactly the rows they should, and nobody could change a table directly.
- The Stage 6 to 8 database tests (186 checks) and all the browser tests from
  Stages 2 to 8 (240 checks) pass with the final changes and the security headers switched on.
- Idle sign-out and headers: 12 browser checks.

**Not tested by me, because I cannot reach them.** These are yours to try in Part 3:

| Item | Why it matters |
| --- | --- |
| Real SMS codes (needs the SMS provider and DLT) | Patients cannot sign in without it |
| Staff confirmation emails through your own email sender (SMTP) | Staff outside your Supabase team cannot activate accounts without it |
| Photo upload against real Supabase Storage | Tested on a stand-in only |
| Razorpay, in Test Mode and then Live | Tested against a simulated Razorpay only |
| The security headers on Vercel together with Razorpay's payment window | If the payment window does not open after go-live, tell me; it is a one-line change |

## Part 1: finish the development project

1. Supabase (development project) > **SQL Editor** > paste all of
   `supabase/009_stage9_hardening.sql` > **Run**.
2. New query > paste all of `supabase/CHECK_security.sql` > **Run**.
   Read the Result column. In development, the test patient (check 14) will show
   FIX; that is expected there and must not appear in production.
3. Publish:
   ```
   git add .
   git commit -m "Stage 9: final checks, security headers, handover"
   git push
   ```
4. Open the live site and sign in as admin, to confirm it still loads after the
   security headers went live. If any page is blank, tell me at once.

## Part 2: create the production project

Keep the development project for trying things. Real patients go in a second,
separate project, so that test data and real data never mix.

### 2.1 Create it

1. Supabase > **New project**. Name: `dr-sonawane-clinic`. Region: **Mumbai**.
   Let Supabase generate the database password and save it in a password manager.
2. **Choose the Pro plan for this project.** On Supabase's pricing page today:
   - Free plan: "Free projects are paused after 1 week of inactivity", and
     automatic backups are not included.
   - Pro plan (from $25 a month): projects are not paused, with "Daily backups
     stored for 7 days".

   A clinic's patient records need backups. I do not recommend real use on the Free plan.
3. Ideally the project belongs to an account the **clinic** controls (see
   `HANDOVER.md`, "Who owns what").

### 2.2 Build the database

1. **SQL Editor** > paste all of `supabase/PRODUCTION_setup_all_in_one.sql` > **Run**.
   This builds everything and removes the sample entries, so the project starts
   with no doctors listed, no holidays, and only the two confirmed fees
   (Skin consultation Rs. 300, Follow-up consultation Rs. 200).
2. New query > paste `supabase/002b_first_admin.sql` (with the real
   administrator's email in it) > **Run**.
3. Add the front-desk registration function: Step 2 of `DESK-REGISTRATION-GUIDE.md`.

### 2.3 Sign-in settings

Repeat the Stage 2 settings in the new project (`STAGE2-GUIDE.md`):

- **Site URL** and **Redirect URLs**: the live web address.
- **Email:** confirmation ON, minimum password length **10**.
- **Your own email sender (SMTP):** required, so invited staff receive their
  confirmation email.
- **Phone:** ON, with the real SMS provider (`SMS-SETUP-GUIDE.md`).
  **Leave the test numbers box empty.** Never enter `919876543210=123456` here.

### 2.4 Online payment (only if you use it)

Repeat Part B of `STAGE8-GUIDE.md` in the new project, with Razorpay **live**
keys and a webhook pointing at the new project's address.

### 2.5 Point the live site at production

1. Supabase (production) > **Connect** / **Project Settings > API**: copy the
   Project URL and the anon (publishable) key.
2. Vercel > your project > **Settings > Environment Variables**: edit
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the production values.
3. Vercel > **Deployments** > the latest > **Redeploy**.
4. Leave the `.env` file on your computer pointing at the **development**
   project. That way `npm run dev` on your computer is always the safe place to try things.

### 2.6 Fill in the clinic's real details

On the live site:

1. **Sign in > Clinic staff > Activate**, with the administrator's email.
2. **Doctors > Add a doctor**, for each doctor: real name, qualification,
   registration number, photo. Do this before inviting them, so you can pick
   their listing in the invitation.
3. **Staff accounts:** invite a second administrator, and each doctor, choosing
   the doctor's listing as you invite them.
4. **Services and fees** (add the clinic's real procedures and prices),
   **Hours and holidays** (add the real holidays), **Clinic details** (logo, email).

## Part 3: go-live checklist

Do not enter a real patient until every box is ticked.

**Database**
- [ ] `CHECK_security.sql` on the production project shows **no FIX rows**.
- [ ] The NOTE rows are either cleared or understood.
- [ ] The project is on a plan with automatic backups.

**Sign-in**
- [ ] A staff member's own phone receives a real SMS code and signs in as a patient.
- [ ] An invited doctor receives the confirmation email and signs in.
- [ ] An email that was never invited cannot create a staff account.
- [ ] The test numbers box in Authentication > Phone is empty.

**A full dry run, with staff playing the patient (no real patient yet)**
- [ ] Register a patient at the desk (a staff member's own number).
- [ ] Book, reschedule and cancel an appointment.
- [ ] Doctor: consultation note, prescription (draft, approve), treatment plan.
- [ ] Photo: consent, upload a photo of an object, share, open, delete.
- [ ] Admin: take a payment, print the receipt, refund it.
- [ ] The staff "patient" sees only their own data in every patient page.
- [ ] Sign in as a second doctor: the first doctor's patient is not visible.
- [ ] Leave a doctor's screen untouched for 31 minutes: it signs out.
- [ ] If online payment is on: one small live payment, then refund it from Razorpay.

**Accounts**
- [ ] Two-step sign-in is on for Supabase, Vercel, GitHub (and Razorpay, the SMS
      provider and the email sender).
- [ ] The clinic knows who holds each account (`HANDOVER.md`).

**Decisions confirmed with the doctors and advisers** (none of these is legal or
tax advice from me):
- [ ] Privacy notice and consent wording reviewed, including under India's
      Digital Personal Data Protection Act. Ask a lawyer or the doctors' association.
- [ ] How long records must be kept, and who may delete them.
- [ ] Photo consent wording (`src/lib/photos.ts`).
- [ ] Whether printed prescriptions are signed by hand, or the app is the record only.
- [ ] GST on receipts, with the accountant.
- [ ] The clinic name spelling (the app says "Dr. Sonawane"), Sunday closing, and
      the right to use the logo image.

**After the dry run.** Payments and the access log cannot be deleted, by design.
So do the dry run with small amounts and refund them, and leave the staff test
person in place under a clear name such as "Test Patient (staff)".

Sources for the plan details: [Supabase pricing](https://supabase.com/pricing.md)
