# Stage 7: progress photos

## What this stage adds

- **Patient:** a **Photos** page. The patient reads the consent wording and
  agrees (or not), can withdraw later, and sees the photos the doctor has shared.
- **Doctor:** a **Progress photos** section at the bottom of each patient record:
  record consent given at the clinic, add a photo, share it with the patient or
  keep it clinic-only, delete it. Photos of the same body area sit side by side
  in date order, so progress is easy to compare.

## The rules the database enforces

| Rule | Why |
| --- | --- |
| No photo can be uploaded unless the patient's consent is on record | Consent comes first, always |
| The exact wording agreed to is saved with each consent | A later change of wording never rewrites the past |
| Only a doctor who treats the patient can upload, see or delete the photos | Same access rule as the record |
| The patient sees a photo only after the doctor shares it | The doctor decides what is helpful to show |
| Administrators cannot see patient photos | Admin duties do not need them |
| Photos are in a private folder with no public link | A copied web address is useless to a stranger |
| A picture opens through a link that stops working after 5 minutes | Links cannot be passed around |
| Consent, uploads, sharing and deletions appear in the access log | The log never shows the picture or the note |

The app also shrinks each photo and saves it as a fresh JPEG before upload. That
keeps uploads quick on a phone, and it drops the hidden details a phone camera
stores inside a photo, such as the GPS location.

## Step 1: add the tables and the private folder

1. Open Supabase > **SQL Editor** > **New query**.
2. Open `supabase/007_stage7_progress_photos.sql`, copy everything, paste, click **Run**.
3. Check **Storage**: there is a new bucket `patient-photos`, and it does **not**
   carry the "Public" label. (`clinic-assets` is public; that one holds only the
   logo and doctor photos.)

## Step 2: try it

Use your test doctor and test patient. **Use a photo of an object, such as a leaf
or a coin, not a photo of a person.**

- [ ] Doctor: open a patient's record and scroll to **Progress photos**. There
      is no Add photo button, only the consent wording.
- [ ] Patient: **Photos** > tick the box > **Give consent**.
- [ ] Doctor: refresh. **Add photo** > choose a picture > Body area "Left cheek"
      > **Upload photo**. It appears, marked "Not visible to the patient".
- [ ] Patient: refresh **Photos**. Nothing is shared yet.
- [ ] Doctor: **Share with patient**. Patient: refresh. The photo is there.
- [ ] Click the photo to open it full size. Copy that address, wait 6 minutes,
      paste it in a new tab: it no longer opens.
- [ ] Doctor: **Delete** > **Yes, delete**. In Supabase > Storage >
      `patient-photos`, the file is gone too.
- [ ] Patient: **Withdraw consent**. Doctor: refresh; Add photo is gone.
- [ ] Admin: **Access log** shows "added the photo consent", "added a progress
      photo" and so on.

This step matters more than usual. I tested the storage rules on a stand-in for
Supabase Storage, so your upload here is the first run against the real thing.
If an upload fails, send me a screenshot of the message.

## Step 3: publish

```
git add .
git commit -m "Stage 7: progress photos and consent"
git push
```

## To decide with the doctors before real use

- **Consent wording.** The text is in `src/lib/photos.ts` (`CONSENT_WORDING`).
  It is a reasonable starting draft, not legal advice. Ask the doctors to read it
  and change it to match how the clinic really uses photographs. If they also
  want a signed paper form, keep using it; "recorded at the clinic" covers that.
- **Children.** For a patient under 18, a parent or guardian should give consent.
  The app does not check age for this. The doctor should record consent at the
  clinic with the parent present.
- **Deleting on request.** A patient who withdraws consent can ask for existing
  photos to be deleted. A treating doctor does this from the record.
- **Phones.** A photo taken through this page is not saved in the phone's
  gallery by the app, but a photo taken with the camera app first is. Advise
  doctors to delete such copies from personal phones.
