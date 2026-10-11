# Stage 5 guide: clinical records and the access log

What Stage 5 adds

| Who | What they can do |
| --- | --- |
| Doctor | My patients list; open a patient's record; write a consultation note (complaints, examination, diagnosis, plan, follow-up date); edit their own notes; keep a medical summary (allergies, long-term conditions, current medicines) |
| Patient | My visits: date, doctor and follow-up date of each visit. The doctor's notes are not shown. |
| Admin | Access log of who opened or changed which record; choose which doctors may open a patient's record |

Rules the database enforces

- Only a doctor who treats a patient can open or write that patient's record.
  A doctor "treats" a patient once the patient has an appointment with them,
  or once an administrator gives them access.
- Administrators cannot read consultation notes or the medical summary.
- A doctor can edit only the notes they wrote. The earlier wording of an
  edited note is kept and can be opened by the treating doctors.
- Notes are never deleted.
- Every time a record is opened or changed, an entry is written to the access
  log. Entries cannot be edited or removed by anyone, and they contain no
  medical wording.
- The app never suggests a diagnosis or treatment. Every word in a note is
  typed by the doctor.

## Part A: run the Stage 5 database file

1. Supabase > **SQL Editor** > **New query**.
2. In VS Code open `supabase\005_stage5_clinical_records.sql`, press `Ctrl + A`, `Ctrl + C`.
3. Paste into Supabase and click **Run**. If it warns about "destructive
   operations", click **Run this query**. You should see "Success".
4. **Table Editor** now also shows `visits`, `visit_revisions`,
   `patient_clinical_profile` and `audit_log`.

## Part B: try it on your computer

You need a doctor login that is linked to a doctor listing (see Part B of
`STAGE4-GUIDE.md`) and a test patient who has an appointment with that doctor.

1. `npm run dev`, then open http://localhost:5173.
2. As the test patient, book an appointment with the doctor for today.
3. Sign in as the doctor. On **Today**, click **Start consultation**.

## Part C: publish

```
git add .
git commit -m "Stage 5: clinical records and access log"
git push
```

## Stage 5 test checklist

Use invented details only. Do not type real patient information yet.

**Doctor**
- [ ] Start consultation opens the patient's record with an empty note form.
- [ ] Saving an empty note is refused.
- [ ] A saved note appears under Consultations, and the appointment becomes Completed.
- [ ] Edit changes your own note. "Edited once" shows the earlier wording.
- [ ] Medical summary: add an allergy and save.
- [ ] My patients lists the patient, with the follow-up date if you set one.

**The main security test: Doctor A cannot open Doctor B's patient**
- [ ] While signed in as a doctor, open **My patients**, click a patient, and
      copy the address (it ends in a long code).
- [ ] Sign out, sign in as a second doctor who has never seen that patient,
      and paste the address. You see "You can only open the records of
      patients you treat".

**Patient**
- [ ] My visits shows the visit date, the doctor and the follow-up date,
      and none of the doctor's notes.
- [ ] The patient home page shows "Follow-up due".

**Admin**
- [ ] Access log lists the doctor opening the record, adding the note and
      changing it, with times. It shows no medical wording.
- [ ] Typing the address of a patient record as admin shows
      "You do not have access to this page".
- [ ] Patients > Doctor access: give a second doctor access to the patient.
      That doctor can now open the record. Remove access: they cannot.

**Security (Supabase > SQL Editor)**
- [ ] This must fail with "AUDIT_LOCKED":
      ```sql
      delete from public.audit_log;
      ```
- [ ] Click **New query**, then this must fail with "permission denied":
      ```sql
      set role anon;
      select * from public.visits;
      ```

## Good to know

- **Doctors who share a patient can read each other's notes** for that
  patient, so care continues smoothly inside the clinic. They cannot edit
  each other's notes.
- **Removing a doctor's access** also hides the notes that doctor wrote for
  that patient from them. The notes themselves stay in the record.
- **Changes made directly in the Supabase dashboard** are logged as
  "Supabase dashboard", because no app user is signed in there. Keep the
  number of people with dashboard access as small as possible.
- **Prescriptions are not part of this stage.** The Plan field is the doctor's
  own note. Prescriptions that patients can see come in Stage 6.

## What changed in the code

| File | What it does |
| --- | --- |
| `supabase/005_stage5_clinical_records.sql` | Visits, medical summary, audit log, and every access rule |
| `src/pages/portal/DoctorPatients.tsx` | My patients |
| `src/pages/portal/DoctorPatientRecord.tsx` | Patient record, consultation notes, medical summary |
| `src/pages/portal/PatientVisits.tsx` | My visits (dates only) |
| `src/pages/portal/AdminAudit.tsx` | Access log |
| `src/components/CareAccess.tsx` | Admin: which doctors may open a record |
| `src/lib/records.ts` | Shared record types |
