# Dr. Sonawane Clinic App

Stage 1 of 9: project foundation, clinic setup tables, and the public welcome page.

You do not need to know how to code. Follow Part A to see the page on your
computer (about 10 minutes), then Part B to connect the database (about 15 minutes).

## What is in this folder

| File or folder | What it is |
| --- | --- |
| `supabase/001_stage1_clinic_setup.sql` | Database tables, security rules and starting data. You paste this into Supabase. |
| `src/pages/Welcome.tsx` | The welcome page: hours, address, doctors, services and fees |
| `src/pages/ComingSoon.tsx` | Placeholder for screens built in later stages |
| `src/components/SiteHeader.tsx` | The header (logo, clinic name, Sign in) shared by all pages |
| `src/lib/clinic.ts` | Loads clinic data from Supabase; holds the built-in sample copy |
| `src/lib/supabase.ts` | The connection to Supabase |
| `src/index.css` | Colours and fonts |
| `src/App.tsx`, `src/main.tsx` | App start-up and page routes |
| `public/logo.png` | The clinic logo. Replace this file to change it. |
| `.env.example` | Template for your two Supabase values |

## Part A: see the page on your computer

1. Install **Node.js** (the "LTS" version) from https://nodejs.org. Accept all defaults.
2. Install **Visual Studio Code** from https://code.visualstudio.com.
3. In VS Code choose **File > Open Folder** and pick this folder:
   `D:\Python\Dermatalogist app`
4. In VS Code choose **Terminal > New Terminal**. Type this and press Enter (takes a minute):
   ```
   npm install
   ```
5. Then type this and press Enter:
   ```
   npm run dev
   ```
6. Open the address it prints (usually http://localhost:5173) in your browser.

You should see the welcome page with a lavender "Preview mode" strip on top. That
strip means the page is showing its built-in sample copy because the database is
not connected yet.

To stop the app, click in the terminal and press `Ctrl + C`.

## Part B: connect the database

1. Create a free account at https://supabase.com and click **New project**.
   - Name: `dr-sonawane-clinic-dev`
   - Database password: let Supabase generate one, and save it in a password manager
   - Region: **Mumbai (ap-south-1)**
2. When the project is ready, open **SQL Editor > New query**.
3. Open `supabase/001_stage1_clinic_setup.sql` from this folder, copy everything,
   paste it into the editor and click **Run**. You should see "Success".
4. Open **Table Editor**. You should see 5 tables: `clinic_settings`, `working_hours`,
   `holidays`, `services`, `doctors`. Each shows an "RLS enabled" label.
5. Open **Project Settings > API** (or the **Connect** button). Copy:
   - the **Project URL**
   - the **anon** key (also called the **publishable** key)
6. In VS Code, make a copy of `.env.example`, name the copy `.env`, and paste the two values:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```
7. Stop the app (`Ctrl + C`) and start it again with `npm run dev`.

The lavender "Preview mode" strip should now be gone. The page is reading from your database.

**Key safety.** Only the URL and the anon/publishable key go in `.env`. Never paste
the `service_role` or `secret` key anywhere in this folder. The `.env` file is
already excluded from GitHub by `.gitignore`.

## Stage 1 test checklist

Tick each one before we move to Stage 2.

- [ ] The welcome page opens on a laptop.
- [ ] It opens on a phone. (Run `npm run dev -- --host`, then open the "Network"
      address it prints on a phone connected to the same Wi-Fi.)
- [ ] The address, both phone numbers and the hours are correct.
- [ ] After Part B, the "Preview mode" strip is gone.
- [ ] **Live data test:** in Supabase > Table Editor > `services`, change a price and
      save. Refresh the page. The new price shows.
- [ ] **Branding test:** in `clinic_settings`, change `primary_color` to `#7A4F73`
      and save. Refresh. The buttons turn plum. Change it back to `#4F7358`.
- [ ] **Hidden service test:** in `services`, untick `is_active` on one row. Refresh.
      That service disappears. Tick it again.
- [ ] **Security test:** in Supabase > SQL Editor run the two lines below. The
      result must be an error saying "permission denied". This proves visitors
      can read clinic information but cannot change it.
      ```sql
      set role anon;
      update public.clinic_settings set name = 'test';
      ```
- [ ] "Book appointment" and "Sign in" open a page saying which stage builds them.

## What to replace before real use

The clinic's address, phone numbers and hours are real. These are placeholders:

- **Clinic name and subheadings.** Edit `name`, `tagline` and `subtitle` in `clinic_settings`.
- **Working days.** Assumed Monday to Saturday, Sunday closed. Edit `working_hours`.
- **Doctors.** Names and qualifications are placeholders (not confirmed yet). Edit `doctors`.
- **Procedures and their prices.** Sample values. Edit `services`. The consultation
  fee (Rs. 300) and follow-up fee (Rs. 200) are the clinic's confirmed fees.
- **Holiday.** One sample entry in `holidays`.

Until the admin portal exists (Stage 3), edit these in Supabase > Table Editor.

## Stage 2

Accounts and roles are set up with the steps in `STAGE2-GUIDE.md`.

## Stage 3

The admin screens for clinic details, hours, holidays, services, doctors and
patients are set up with the steps in `STAGE3-GUIDE.md`.

## Stage 4

Online booking, calendars and doctor leave are set up with the steps in
`STAGE4-GUIDE.md`.
