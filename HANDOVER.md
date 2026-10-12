# Handover: running the clinic app

For the person who looks after the app at the clinic. No coding is needed for
anything on this page.

## What the app is

One clinic, three portals.

| Portal | Who | What they can do |
| --- | --- | --- |
| Patient | Signs in with a patient number and a 6-digit PIN, set up with a code from the desk | Book, move and cancel own appointments; see own visits, approved prescriptions, treatment plans, shared photos, receipts; give or withdraw photo consent |
| Doctor | Invited by an admin; email and password | Own calendar and leave; records of patients they treat: notes, prescriptions, treatment plans, photos |
| Admin | Invited by an admin; email and password | Clinic details, hours, services, doctors, staff accounts, all appointments, payments and receipts, the access log. **Cannot** read notes, prescriptions or photos |

The rules are enforced by the database itself, not only by the screens.

## Who owns what

Fill this in and keep it somewhere safe (not in this folder, which goes to GitHub).

| Service | What it holds | Account email | Who at the clinic can sign in |
| --- | --- | --- | --- |
| Supabase (production) | The database, logins, patient photos | | |
| Supabase (development) | Test copy only | | |
| Vercel | The website | | |
| GitHub | The app's code | Trupti110507 | |
| Email sender (SMTP) | Sends staff confirmation emails | | |
| Razorpay (if used) | Online payments | | |
| Web address (if bought) | The domain name | | |

Rules for these accounts:

- The **clinic** should be able to get into every one of them. If only one
  person holds the passwords and that person is unavailable, the clinic is locked out.
- Turn on two-step sign-in everywhere it is offered.
- Keep passwords in a password manager. Never in this folder, in chat, or in email.
- The Supabase **service_role / secret key**, the Razorpay **Key Secret** and the
  SMS **Auth Key** are never typed into the app's code, VS Code or GitHub.

## Routine

**Every day** (admin)
- Register new patients at the desk and hand over their sign-in slip.
- Take payments in Admin > Payments. At closing, set the period to Today and
  compare the Cash total with the cash drawer.

**Every week** (admin)
- Admin > **Access log**: skim for anything unexpected, such as records opened at odd hours.
- Admin > **Staff accounts**: is everyone listed still working at the clinic?

**Every month**
- Admin > Payments > This month > **Download as a spreadsheet file**. Send it to the accountant and keep a copy.
- Supabase > Database > Backups: confirm that recent daily backups are listed.
- Run `supabase/CHECK_security.sql`. It should show no FIX rows.

**Every year, on 1 April**
- Nothing to do. Receipt numbers start again at 0001 for the new financial year by themselves.

## When staff join or leave

- **Joining:** Admin > Staff accounts > invite by email. For a doctor, choose
  their listing. They open the site > Sign in > Clinic staff > Activate.
- **Leaving:** the same day, Admin > Staff accounts > switch the account **off**.
  Access stops at once. Their notes and prescriptions stay in the records.
- **A doctor needs to see another doctor's patient:** Admin > Patients > Doctor
  access. This is recorded in the access log.
- Keep **two** administrator accounts, held by two people.

## Backups

- The production project should be on a Supabase plan with automatic daily backups.
- As far as I know, those backups cover the database (appointments, notes,
  prescriptions, payments) but **not the photo files** held in Storage. Check
  Supabase's backup documentation for the current position. If photos must be
  backed up too, tell me and I will add an export.
- The monthly payments file is your own independent copy of the money records.
- Once, before go-live or soon after, ask Supabase support or a developer to
  walk through a restore on the development project, so the first restore is not during an emergency.

## If something goes wrong

| What happened | What to do |
| --- | --- |
| A staff password may be known to someone else | Admin > Staff accounts > switch the account off. Have them use "Forgot password", then switch it back on |
| A staff phone or laptop is lost | Switch that person's account off at once. The app also signs staff out after 30 minutes without use |
| Someone may have seen records they should not | Switch off the account involved. Admin > Access log shows who opened which record and when. Write down what you find, and tell the doctor in charge. There may be a legal duty to report; ask a lawyer |
| A patient forgot their PIN, or lost the slip | Admin > Patients > **New setup code** next to their name. Give them the new slip. Their records are untouched |
| A patient's sign-in is locked after wrong PINs | It unlocks by itself after 30 minutes. A new setup code unlocks it at once |
| Several patients say sign-in is "busy" | Many wrong PINs were typed on the site in a short time. It reopens by itself after 15 minutes. If it keeps happening, check Admin > Access log and tell a developer |
| The website does not load | Check https://www.vercel-status.com and https://status.supabase.com. If both are fine, look at Vercel > Deployments for a failed deployment and click Redeploy on the last good one |
| A page shows "permission denied" or "not allowed" to the right person | Note the page and the message, and ask a developer. Do not loosen database rules to get past it |
| A patient was registered twice by mistake | Admin > Patients > Deactivate the duplicate |
| A wrong payment was saved | Refund it with a reason and save the correct one. Payments cannot be edited, on purpose |
| A wrong prescription was approved | The doctor withdraws it with a reason and writes a new one |
| A patient asks for their photos to be deleted | A treating doctor deletes them from the patient's record |
| A patient asks for a copy of, or the deletion of, their data | The app has no button for this. Ask a developer, and a lawyer about what must be kept |

## Making changes later

- **Words, prices, hours, doctors, logo, colours:** all in the Admin portal. No code.
- **Anything else:** make the change on your computer, try it against the
  **development** project (`npm run dev`), then `git add .`, `git commit`, `git push`.
  Vercel publishes it in about a minute.
- **A database change:** run the SQL on the development project first, try it,
  then run the same SQL on production.
- Never test with real patients, and never copy real patient data into the development project.

## Known limits

Be aware of these before go-live. Each can be built if the clinic needs it.

- No appointment reminders by SMS or WhatsApp.
- No button for a patient to download or delete all their data.
- Receipts carry no GST lines.
- The app is in English only.
- It needs an internet connection; there is no offline mode.
- Refunds are records only; money is returned by hand or from Razorpay.
- Photo files may not be covered by database backups (see Backups).

## Where the technical detail lives

| Topic | File |
| --- | --- |
| Database tables, rules and functions, with comments in plain words | `supabase/001_...sql` to `supabase/011_...sql` |
| Security self-check | `supabase/CHECK_security.sql` |
| Setup and testing steps for each feature | `README.md`, `STAGE2-GUIDE.md` to `STAGE9-GUIDE.md` |
| Online payment server code | `supabase/functions/razorpay/index.ts` |
| Front-desk registration server code | `supabase/functions/register-patient/index.ts` |
| Patient PIN sign-in server code | `supabase/functions/patient-login/index.ts` |
| Screens | `src/pages/`, `src/components/` |
