# Stage 2 guide: accounts and roles

What Stage 2 adds

- **Patients** sign in with their mobile number and a one-time code (OTP).
- **Doctors and administrators** sign in with email and password. They can only
  get an account if an administrator invites their email first.
- Each person is sent to their own portal and blocked from the other two.
- The database enforces all of this, not just the screens.

Do the parts in order. Parts A to D are in Supabase, Part E is on your computer.

## Part A: run the Stage 2 database file

1. Supabase > **SQL Editor** > **New query**.
2. In VS Code open `supabase\002_stage2_accounts_roles.sql`, press `Ctrl + A`, `Ctrl + C`.
3. Paste into Supabase and click **Run**. If it warns about "destructive operations",
   click **Run this query**. You should see "Success".
4. **Table Editor** now also shows `profiles`, `patients` and `staff_invites`.

## Part B: sign-in settings

1. Supabase > **Authentication** > **URL Configuration**.
   - **Site URL:** `https://dr-sonawane-clinic.vercel.app`
   - **Redirect URLs:** add both of these
     - `https://dr-sonawane-clinic.vercel.app/**`
     - `http://localhost:5173/**`
2. **Authentication** > **Sign In / Providers** > **Email**.
   - **Confirm email:** must be **ON**. This is a security requirement: a staff
     account only works after the invited person proves they own the email.
   - **Minimum password length:** set to `10`.

## Part C: mobile OTP for patients

1. **Authentication** > **Sign In / Providers** > **Phone** > switch it **ON**.
2. Supabase needs an SMS provider to send real codes. It supports Twilio,
   MessageBird, Vonage and TextLocal. For India you also need DLT registration
   of the sender name and message template before SMS is delivered. That takes
   days, so start it when you are ready; nothing else waits for it.
3. **To test today without sending any SMS:** in the same Phone settings, find
   **Test Phone Numbers and OTPs** and enter
   ```
   919876543210=123456
   ```
   Then the number `98765 43210` always accepts the code `123456`. If the form
   will not save without provider details, pick Twilio and type placeholder
   text in its fields; test numbers never contact the provider.
   Use only invented numbers here, and remove them before real patients use the app.

## Part D: create the first administrator (you)

1. In VS Code open `supabase\002b_first_admin.sql`. Replace
   `your-email@example.com` and `Your Full Name` with your own.
   **Use the same email you use to log in to Supabase.** (See "Email limits" below.)
2. Copy the file into Supabase > SQL Editor and click **Run**.
3. Start the app (`npm run dev`), open http://localhost:5173, click **Sign in** >
   **Clinic staff** > **First time? Activate your account**.
4. Enter that email and choose a password of at least 10 characters.
5. Open the confirmation email from Supabase and click the link.
6. You land in the **Admin portal**. From now on, invite doctors and other
   administrators from **Staff accounts**, never from SQL.

## Part E: publish

```
git add .
git commit -m "Stage 2: accounts and roles"
git push
```

Vercel redeploys in about a minute.

## Stage 2 test checklist

Tick each one. All of them must pass before Stage 3.

**Patient**
- [ ] Sign in > Patient > `9876543210` > code `123456` takes you to the Welcome step.
- [ ] The Welcome step refuses to continue without your name and the consent tick.
- [ ] After that you see "Hello, (your name)" in the Patient portal.
- [ ] My profile saves a date of birth and an emergency contact.
- [ ] While signed in as the patient, type `/admin` after the address. You see
      "You do not have access to this page". Same for `/doctor`.

**Administrator**
- [ ] Activating with an email that was NOT invited is refused.
- [ ] Your invited admin account activates and opens the Admin portal.
- [ ] Staff accounts > invite a doctor (use a second email you own).
- [ ] Your own row has no Deactivate button.
- [ ] Typing `/doctor` after the address shows "You do not have access".

**Doctor**
- [ ] The invited doctor activates and lands in the Doctor portal.
- [ ] Typing `/admin` or `/patient` shows "You do not have access".
- [ ] Back as admin: Deactivate the doctor. The doctor now sees
      "This account has been deactivated". Activate again restores access.

**Security (run in Supabase > SQL Editor)**
- [ ] This must fail with "permission denied":
      ```sql
      set role anon;
      select * from public.profiles;
      ```
- [ ] Click **New query** (to reset), then this must also fail with "permission denied":
      ```sql
      set role authenticated;
      update public.profiles set role = 'admin';
      ```

## Email limits you should know about

Supabase's built-in email service is for testing only. It sends just a few
emails per hour, and only to email addresses that belong to members of your
Supabase organization. That is why Part D says to use your Supabase login email.

Before real doctors activate their accounts, connect a proper email sender:
Supabase > **Authentication** > **Emails** > **SMTP Settings**, using a service
such as Resend or Brevo (both have free plans). Tell me when you want to do
this and I will give you the steps.

## What changed in the code

| File | What it does |
| --- | --- |
| `supabase/002_stage2_accounts_roles.sql` | Tables, roles, security rules and account actions |
| `supabase/002b_first_admin.sql` | One-time invitation for the first administrator |
| `src/lib/auth.tsx` | Knows who is signed in and their role |
| `src/lib/ui.ts`, `src/components/Field.tsx` | Shared buttons, fields and messages |
| `src/components/RequireRole.tsx` | Sends each role to its own portal |
| `src/components/PortalShell.tsx` | Portal layout and menu |
| `src/pages/SignIn.tsx` | Patient OTP and staff email sign-in |
| `src/pages/StaffActivate.tsx` | Invited staff set their password |
| `src/pages/ResetPassword.tsx` | Forgot password for staff |
| `src/pages/portal/*` | Patient welcome, home and profile; doctor home; admin home and staff accounts |
