# Stage 6: prescriptions and treatment plans

## What this stage adds

- **Doctor:** inside a patient's record, two new sections.
  - **Prescriptions.** The doctor types each medicine, dose, how often and for how
    long, saves it as a **draft**, checks it, then **approves** it.
  - **Treatment plans.** For treatments that run over several sessions (peels,
    laser). The doctor sets the number of sessions and records each one.
- **Patient:** two new pages, **Prescriptions** (with a Print button) and
  **Treatment plans** (sessions done, and the doctor's instructions).

## The rules the database enforces

| Rule | Why |
| --- | --- |
| Only a doctor who treats the patient can write a prescription or plan | Same access rule as the patient record |
| A prescription starts as a draft, and the patient cannot see a draft | Nothing reaches the patient by accident |
| Only the doctor who wrote it can approve it | The prescriber takes responsibility |
| An approved prescription can never be edited or deleted | The patient's copy and the clinic's copy always match |
| A wrong prescription is **withdrawn** with a reason, and a new one is written | The mistake stays on record instead of vanishing |
| Administrators cannot read prescriptions or plans | Admin duties do not need them |
| The app never suggests or fills in a medicine | Every word is the doctor's |
| Writing, changing, approving and withdrawing appear in the access log | The log shows that it happened, never the medicine names |

## Step 1: add the tables to Supabase

1. Open Supabase > **SQL Editor** > **New query**.
2. Open `supabase/006_stage6_prescriptions.sql`, copy everything, paste, click **Run**.
3. You should see "Success". In **Table Editor** there are three new tables:
   `prescriptions`, `prescription_items`, `treatment_plans`.

## Step 2: try it

Use your test logins (a doctor linked to a doctor listing, and the test patient).
Use made-up medicine names such as "Sample Cream A". Do not enter real patients yet.

- [ ] Doctor: **My patients** > open a patient > **New prescription**. The form
      shows the allergies from the medical summary.
- [ ] Add two medicines and **Save draft**. The draft is marked "Not visible to the patient".
- [ ] Patient: open **Prescriptions**. It is empty.
- [ ] Doctor: **Approve** > **Yes, approve**.
- [ ] Patient: refresh **Prescriptions**. The prescription is there. Click **Print**:
      the preview shows only the prescription on the clinic letterhead.
- [ ] Doctor: the approved prescription has no Edit button. Click **Withdraw**,
      give a reason. Patient: it is gone after a refresh.
- [ ] Doctor: **New treatment plan**, 3 sessions. Click **Record session 1**.
- [ ] Patient: **Treatment plans** shows "1 of 3 sessions done" and the
      instructions, but not the doctor's clinical notes.
- [ ] Admin: **Access log** shows "added a prescription" and "changed a
      prescription" with no medicine names.

## Step 3: publish

In the VS Code terminal:

```
git add .
git commit -m "Stage 6: prescriptions and treatment plans"
git push
```

## To decide with the doctors before real use

- **Signature.** The printed sheet has a line for the doctor's pen signature. Ask
  the doctors whether a printout signed by hand is how they want to issue
  prescriptions, or whether they will keep writing on their own pad and use the
  app as the clinic's record. This is a professional and legal question for them.
- **Registration number.** It prints under the doctor's name once it is entered in
  Admin > Doctors. It is blank on the placeholder doctors.
