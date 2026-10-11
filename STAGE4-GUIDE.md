# Stage 4 guide: appointments

What Stage 4 adds

| Who | What they can do |
| --- | --- |
| Patient | Book online (service, doctor, day, time), see upcoming and earlier appointments, reschedule, cancel |
| Doctor | Today's list with patient name and phone, mark Attended or Did not attend, book a follow-up, day / week / month calendar, own time off |
| Admin | Any day's appointments for all doctors, filter by doctor, book for a patient, reschedule, cancel, mark attendance, doctor leave |

Rules the database enforces

- A doctor can never have two appointments at the same time, even if two
  people press Confirm in the same instant.
- Times offered are inside clinic hours, on the slot length you set, not on a
  holiday, not in the past, within the booking window, and not during a
  doctor's leave.
- A patient can hold at most 3 upcoming appointments, and cannot be in two
  places at once.
- Patients see only their own appointments. A doctor sees only their own calendar.

## Part A: run the Stage 4 database file

1. Supabase > **SQL Editor** > **New query**.
2. In VS Code open `supabase\004_stage4_appointments.sql`, press `Ctrl + A`, `Ctrl + C`.
3. Paste into Supabase and click **Run**. If it warns about "destructive
   operations", click **Run this query**. You should see "Success".
4. **Table Editor** now also shows `appointments`, `doctor_time_off` and `care_relationships`.

## Part B: link each doctor's login to their listing

A doctor only sees a calendar if their login is linked to their listing on the
website. This happens automatically when you invite a doctor and choose
**Listing on the website** in Staff accounts.

If a doctor was invited with "Not linked yet", link them once in Supabase >
SQL Editor (replace the email and the name):

```sql
update public.doctors
   set profile_id = (select user_id from public.profiles where email = 'doctor-email@example.com')
 where full_name = 'Dr. Name As Shown On Website';
```

An unlinked doctor sees a notice saying so when they sign in.

## Part C: try it on your computer

1. `npm run dev`, then open http://localhost:5173.
2. Sign in as the test patient (98765 43210, code 123456) and click **Book appointment**.

## Part D: publish

```
git add .
git commit -m "Stage 4: appointments"
git push
```

## Stage 4 test checklist

**Patient** (test patient)
- [ ] Book appointment: choose a service, a doctor, a day and a time, then confirm.
- [ ] Sundays (or your closed days) and holidays cannot be chosen.
- [ ] The booking appears under My appointments and on the patient home page.
- [ ] Reschedule moves it to a new time.
- [ ] Cancel asks for confirmation; the appointment then shows as Cancelled.
- [ ] **Double-booking test:** open the site in two browser windows (one normal,
      one Incognito) as two different test patients. Choose the same doctor,
      day and time in both, then press Confirm in both. Only one succeeds; the
      other says the time has just been taken.

**Doctor**
- [ ] Today lists the doctor's own appointments with patient name and phone.
- [ ] Attended and Did not attend change the badge.
- [ ] After Attended, Book follow-up books the same patient again.
- [ ] Calendar switches between Day, Week and Month.
- [ ] My time off: add a day off. As the patient, that day shows "No free times".

**Admin**
- [ ] Appointments shows the chosen day for all doctors, with the counts line.
- [ ] The Doctor filter narrows the list.
- [ ] Book for a patient: search, choose, and book.
- [ ] Doctor leave: add leave for a doctor.

**Security**
- [ ] As the test patient, add `/admin/appointments` to the address:
      "You do not have access to this page".
- [ ] In Supabase > SQL Editor, this must fail with "permission denied":
      ```sql
      set role anon;
      select * from public.appointments;
      ```

## Good to know

- **Admin cannot book for someone who has never signed in.** A new patient
  signs in once with their mobile number; after that they appear in the
  patient search. Until real SMS is set up, only test numbers can sign in.
- **No reminders yet.** SMS or email reminders need the SMS and email services
  to be connected first.
- **Fees are shown, not collected.** Payment is still at the clinic. Recording
  payments and receipts comes in Stage 8.
- **Changing clinic hours does not move existing bookings.** If you shorten
  the hours, check that day's appointments and move any that fall outside.

## What changed in the code

| File | What it does |
| --- | --- |
| `supabase/004_stage4_appointments.sql` | Appointment tables, the no-double-booking guard, all booking rules |
| `src/pages/Book.tsx` | The public Book appointment page |
| `src/components/BookingFlow.tsx`, `SlotPicker.tsx` | The booking steps and the day and time picker |
| `src/components/AppointmentItem.tsx` | One appointment with reschedule, cancel and attendance actions |
| `src/components/TimeOffManager.tsx` | Doctor leave |
| `src/pages/portal/PatientAppointments.tsx` | My appointments |
| `src/pages/portal/DoctorHome.tsx`, `DoctorCalendar.tsx`, `DoctorTimeOff.tsx` | Doctor portal |
| `src/pages/portal/AdminAppointments.tsx`, `AdminTimeOff.tsx` | Admin portal |
| `src/lib/appointments.ts`, `useAppointments.ts` | Shared appointment helpers |
