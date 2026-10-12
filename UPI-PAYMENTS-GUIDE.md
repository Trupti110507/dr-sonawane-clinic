# UPI payments by QR code

Patients pay the clinic by UPI (PhonePe, Google Pay, Paytm, BHIM, any bank app).
The money goes straight into the clinic's bank account. There is no payment
company in between, so there is **no fee and no sign-up**.

## How it works

- **At the desk:** in Admin > Payments, click **Take payment** and choose **UPI**.
  A QR code appears with the exact amount already filled in. The patient scans it
  and pays.
- **From home:** the patient opens **Payments** in their portal and clicks
  **Pay by UPI** next to an unpaid appointment. They see the same QR code. On a
  phone there is also an **Open my UPI app** button, so they do not need a second
  phone to scan. The page works in Marathi too.
- **The receipt:** the app cannot see the clinic's bank account. So it does not
  know by itself that money has arrived. The desk checks the clinic's own UPI app
  or bank SMS, then clicks **Save payment and issue receipt**. The receipt then
  appears in the patient's portal.

## Rules

| Rule | Why |
| --- | --- |
| Only an administrator can set or change the clinic's UPI ID, and the change is written in the access log | Someone swapping in their own UPI ID would divert the clinic's money |
| The desk saves a UPI payment only after seeing the money in the clinic's own app or bank SMS | A "payment successful" screen on a patient's phone can be faked or edited |
| The UPI reference number (UTR) is optional, saved with the payment, and cannot be used on two receipts | The accountant can match receipts with the bank statement, and one payment cannot be shown twice |
| A saved payment, including its UPI reference, can never be edited | Same as every other payment |

## Set it up (about 10 minutes)

### Step 1: add to the database

1. Supabase > **SQL Editor** > **New query**.
2. Open `supabase/012_upi_qr.sql`, copy everything, paste, click **Run**.
   It should say "Success. No rows returned".

### Step 2: publish the app

In VS Code, **Terminal > New Terminal**:

```
git add .
git commit -m "UPI payments by QR code"
git push
```

Wait until Vercel > Deployments shows the new row as **Ready**.

### Step 3: find the clinic's UPI ID

Skip this step if the clinic already has a printed UPI QR code: step 4 reads the
UPI ID from a photo of it.

Use the clinic's **own** bank account, the one the accountant uses for the clinic.

- Best: a **business (merchant) UPI ID**. You can get one free from the clinic's
  bank, or from PhonePe Business, Google Pay for Business or Paytm for Business.
  Business IDs accept any amount from a QR code, and the clinic gets a sound alert
  for each payment.
- A personal UPI ID also works for scanning. But some UPI apps limit payments to
  personal IDs, and they can show warnings for amounts typed in by a link.

You can find the UPI ID in the UPI app, under the profile or under "My QR". It
looks like `name@okaxis`, `9876543210@ybl` or `drsonawane@paytm`.

### Step 4: save it in the app

1. Sign in as the administrator > **Payments**, then scroll down to
   **UPI for payments**.
2. **Easiest:** click **Choose a photo of the QR code** and pick a photo of the
   clinic's printed UPI QR (the one patients already scan at the counter), or a
   screenshot of it from the clinic's UPI app. On a phone you can take the photo
   right there. The **UPI ID** and **Name on the account** are filled in for you.
   Bharat QR codes from banks work too.
3. Or type them yourself. **UPI ID:** the ID from step 3. **Name on the account:**
   the name the bank shows to people who pay, for example "Dr Sonawane Clinic".
4. Check both boxes, then click **Save UPI details**. Nothing is saved until you
   click it.

To switch it off, empty the UPI ID box and save.

### Step 5: test with ₹1

1. Book a test appointment for your test patient for today.
2. Admin > Payments > **Take payment**. Change the amount to **1**, choose **UPI**.
3. Scan the QR with **another phone** and pay ₹1.
4. Check the name your UPI app showed before you entered the UPI PIN. It must be
   the clinic's name.
5. Check that the ₹1 arrived in the clinic's account.
6. Type the 12-digit reference number from the clinic's payment message into
   **UPI reference number** and save. The receipt shows the reference.
7. As the test patient, open **Payments**: the receipt is there.
8. Refund the ₹1 test payment with the reason "Test", and send the ₹1 back.

## Daily use at the desk

1. **Take payment** > choose **UPI** > turn the screen (or a printed QR) toward the patient.
2. Wait for the **clinic's** phone to show the payment, or the bank SMS to arrive.
   Do not go by the patient's phone.
3. Optional: type the reference number.
4. **Save payment and issue receipt.**

If a patient says they paid from home: open the clinic's UPI app, find the payment
by amount and name (the patient's name and the service appear as the payment note),
then record it with **Take payment** > **UPI**, and include the reference number.

## Checked before handover

- Database tests (26): only an administrator can set the UPI ID, and not by editing
  the table directly. Bad UPI IDs and phone numbers on their own are refused. Every
  change is in the access log. A UPI reference is accepted only for UPI, cannot be
  reused, and cannot be changed later. Patients see only their own references.
  Doctors see no payments.
- Browser tests (26), on a computer and on a phone: reading the UPI ID from a
  tilted, slightly blurred 12-megapixel phone photo of a QR works, and a website QR
  or a picture with no QR gets a clear message. the QR is drawn inside the app,
  with no outside website. It holds the right UPI ID, name and amount (checked by
  reading the QR back). There is no "Open my UPI app" button on a computer. The
  Marathi version works, the page has no sideways scrolling on a phone, and the
  QR disappears when UPI is switched off.
- `CHECK_security.sql` has two new lines: **24** (the UPI ID is protected) and
  **25** (shows which UPI ID is in use, so you can confirm it is the clinic's).
