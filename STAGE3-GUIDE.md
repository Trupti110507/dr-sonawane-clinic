# Stage 3 guide: administrators manage the clinic

What Stage 3 adds to the Admin portal

| Screen | What you can do |
| --- | --- |
| Clinic details | Name, two subheadings, address, phones, email, logo, brand colours, appointment length, how far ahead patients can book |
| Hours and holidays | Morning and afternoon times for each day, closed days, holiday dates |
| Services and fees | Add, edit, reprice, retire and bring back services |
| Doctors | Name, qualification, registration number, specialities, fee, photo; hide or show on the website |
| Patients | Registered patients with mobile number and status; search; deactivate or activate |

Every change appears on the public website straight away. You no longer need
Supabase's Table Editor for these.

## Part A: run the Stage 3 database file

1. Supabase > **SQL Editor** > **New query**.
2. In VS Code open `supabase\003_stage3_clinic_admin.sql`, press `Ctrl + A`, `Ctrl + C`.
3. Paste into Supabase and click **Run**. If it warns about "destructive
   operations", click **Run this query**. You should see "Success".
4. Check: Supabase > **Storage** now lists a bucket called `clinic-assets`.

## Part B: try it on your computer

1. In the VS Code terminal: `npm run dev`, then open http://localhost:5173.
2. Sign in on the **Clinic staff** tab with your administrator account.
3. The dashboard shows six areas. Open each one.

## Part C: publish

```
git add .
git commit -m "Stage 3: clinic administration"
git push
```

## Stage 3 test checklist

Sign in as the administrator for these.

**Clinic details**
- [ ] Clear the Name box and save: it is refused with a message.
- [ ] Change the name, save, and see the header change at once. Change it back.
- [ ] Upload a logo image: it replaces the logo in the header.
- [ ] Pick a very light main colour: a readability warning appears.

**Hours and holidays**
- [ ] Set a closing time earlier than the opening time and save: it is refused.
- [ ] Untick Closed on Sunday, give it morning hours, save. Open the website
      (the clinic name at top left): Sunday shows its own hours.
- [ ] Add a holiday for a future date. It appears on the website under
      "Closed on these days". Remove it again.

**Services and fees**
- [ ] Add a service. It appears on the website.
- [ ] Edit a fee. The website shows the new fee.
- [ ] Retire a service. It disappears from the website but stays in your list.

**Doctors**
- [ ] Replace "Doctor 1 (name to be added)" with the real name and qualification.
- [ ] Upload a photo and save. It shows on the website.
- [ ] Hide a doctor. They disappear from the website.

**Patients**
- [ ] The test patient appears. Search finds them by name and by number.
- [ ] Deactivate asks you to confirm.

**Security**
- [ ] Sign out, sign in as the test patient (98765 43210, code 123456), and add
      `/admin/clinic` to the address. You see "You do not have access to this page".
- [ ] In Supabase > SQL Editor, this must fail with "permission denied":
      ```sql
      set role anon;
      update public.services set price_inr = 1;
      ```

## Good to know

- **Retire, not delete.** Services and doctors are never deleted, so that past
  appointments and receipts still make sense later. Retired items are hidden
  from patients.
- **Images are public.** The logo and doctor photos can be opened by anyone
  with the link, because they are shown on the public website. Patient
  treatment photos will use a separate private folder in a later stage.
- **Doctor listing and doctor login are separate.** This screen controls what
  the website shows. The doctor's login is created in Staff accounts, where
  you can link it to a listing.

## What changed in the code

| File | What it does |
| --- | --- |
| `supabase/003_stage3_clinic_admin.sql` | Admin-only write rules, extra value checks, image folder |
| `src/pages/portal/AdminClinic.tsx` | Clinic details, logo, colours, appointment settings |
| `src/pages/portal/AdminHours.tsx` | Weekly hours and holidays |
| `src/pages/portal/AdminServices.tsx` | Services and fees |
| `src/pages/portal/AdminDoctors.tsx` | Doctor listings and photos |
| `src/pages/portal/AdminPatients.tsx` | Patients list |
| `src/components/ImageUpload.tsx` | Image picker with size and type checks |
| `src/lib/clinic.ts`, `src/pages/Welcome.tsx` | Website now shows holidays, uploaded logo and doctor photos |
