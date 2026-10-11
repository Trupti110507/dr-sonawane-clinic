# Stage 8: payments, receipts and reports

This stage has two parts. **Part A** (payments at the desk) works as soon as you
run one SQL file. **Part B** (online payment through Razorpay) is optional and
stays switched off until you set up a Razorpay account. Do Part A now. Do Part B
when the clinic is ready.

## What this stage adds

- **Admin > Payments**
  - *Take a payment:* the day's appointments with their fees. Click **Take
    payment**, choose Cash, UPI or Card, save. A numbered receipt is issued.
  - *Other payment:* for anything not tied to an appointment, such as a procedure
    session. Choose the patient, say what it is for, enter the amount.
  - *Payments received:* choose a period (Today, This month, or any dates) to see
    the total received, the split by method, each day's total, and every receipt.
    **Download as a spreadsheet file** gives your accountant a file that opens in Excel.
  - *Refund:* marks a payment refunded, with a reason.
- **Patient > Payments:** what is still to pay, and every receipt with a Print button.

## The rules the database enforces

| Rule | Why |
| --- | --- |
| Only an administrator records desk payments and refunds | Billing is an admin duty |
| A patient sees only their own payments | Privacy |
| Doctors do not see payments | Not needed to treat |
| Receipt numbers run 0001, 0002 ... within each financial year (April to March), no gaps, never reused | Clean books |
| A saved payment cannot be edited or deleted, by anyone | A receipt handed to a patient must stay true |
| A mistake is corrected by a refund with a reason; the receipt stays, marked Refunded | Nothing disappears |
| An appointment cannot be paid for twice at the desk | Prevents double charging |
| For online payment, the database sets the amount from the service price | The patient's browser cannot change what is charged |
| An online payment counts only after the clinic's server has checked it with Razorpay | A faked "success" message gets no receipt |
| Payments and refunds appear in the access log, without amounts | Accountability |

**A refund in this app is a record, not a transfer.** It notes that the money
went back. You still hand back the cash, or send the refund from the Razorpay
dashboard for an online payment.

## Part A: desk payments

### Step 1: add the tables

1. Supabase > **SQL Editor** > **New query**.
2. Open `supabase/008_stage8_payments.sql`, copy everything, paste, click **Run**.

### Step 2: try it

Use your test logins and made-up amounts.

- [ ] Book an appointment for the test patient for today (Admin > Appointments).
- [ ] Admin > **Payments**. The appointment is listed with its fee.
- [ ] **Take payment** > the amount is already filled in > choose **UPI** > save.
      You see "Payment recorded. Receipt 2026-27/0001".
- [ ] The appointment now shows "Paid" with the receipt number.
- [ ] **Other payment** > find the patient > "Chemical peel, session 1" > 1500 >
      **Cash** > save. Receipt 0002.
- [ ] The summary shows the total, split into Cash and UPI.
- [ ] Click **Print** on a receipt. The preview shows only the receipt, on the
      clinic letterhead.
- [ ] **Refund** one payment with a reason. It moves from Received to Refunded,
      and the receipt is marked Refunded.
- [ ] **Download as a spreadsheet file** and open it in Excel.
- [ ] Patient: **Payments** shows their receipts only, with "Pay at the clinic"
      for anything unpaid.

### Step 3: publish

```
git add .
git commit -m "Stage 8: payments, receipts and reports"
git push
```

## Part B: online payment with Razorpay (optional, later)

**What I could and could not test.** The server function passed 25 checks against
a simulated Razorpay, including forged confirmations and altered amounts. I have
no Razorpay account, so it has not run against the real Razorpay. Do the steps
below in Razorpay's **Test Mode** first. No real money moves in Test Mode.
Razorpay's and Supabase's screens change over time, so a button may sit in a
slightly different place than described. Send me a screenshot if you are stuck.

1. **Razorpay account.** Sign up at https://razorpay.com in the clinic's name.
   Stay in **Test Mode** (a switch in the dashboard).
2. **Test keys.** In Razorpay, find **API Keys** (under Account & Settings) and
   generate a test key. You get a **Key Id** (starts with `rzp_test_`) and a
   **Key Secret**. The secret is shown once. Keep it in a password manager.
   **Do not paste the Key Secret into this chat, into VS Code, or into GitHub.**
3. **Give the keys to Supabase.** Supabase > **Edge Functions** > **Secrets**.
   Add three secrets:
   - `RAZORPAY_KEY_ID` = the Key Id
   - `RAZORPAY_KEY_SECRET` = the Key Secret
   - `RAZORPAY_WEBHOOK_SECRET` = a long random phrase you make up (save it too)
4. **Add the server function.** Supabase > **Edge Functions** > **Deploy a new
   function** > **Via Editor**.
   - Name it exactly `razorpay`.
   - Delete the sample code. Open `supabase/functions/razorpay/index.ts` from
     this folder, copy everything, paste it in.
   - Find the setting **Verify JWT** for this function and switch it **off**.
     (Razorpay's own messages carry no login. The function checks every request itself.)
   - Click **Deploy**.
5. **Tell Razorpay where to report payments.** Razorpay > **Webhooks** > add one:
   - URL: `https://nzoexwyvadtyljpzdojd.supabase.co/functions/v1/razorpay`
   - Secret: the same phrase as `RAZORPAY_WEBHOOK_SECRET`
   - Event: tick **payment.captured**
6. **Switch it on.** In the app: Admin > Payments > **Switch online payment on**.
7. **Test.** As the test patient, book an appointment, open **Payments**, click
   **Pay online**, and pay with one of Razorpay's test cards or test UPI IDs
   (listed in Razorpay's documentation under "test cards"). Then check:
   - [ ] The patient sees "Payment received" and a receipt marked Online.
   - [ ] Admin > Payments shows it under Online.
   - [ ] Start a payment and close the window without paying: no receipt appears.

**Going live** (after Stage 9): complete Razorpay's business verification (KYC),
generate **live** keys, replace the three secrets in Supabase with the live
values, and add the webhook again in Live Mode. Razorpay charges a fee on each
online payment; check their current pricing before deciding.

## To decide with the clinic's accountant before real use

- **GST.** Receipts show the amount received with no tax lines. Consultations by
  a clinic are generally exempt from GST, but some cosmetic procedures may not
  be. I am not a tax adviser; ask the accountant whether any service needs GST
  on its receipt. If so, tell me and I will add it.
- **Receipt numbering.** Numbers look like `2026-27/0001` and restart each April.
  Tell me if the accountant wants a different format.
- **Old paper receipts.** If the clinic already issues numbered paper receipts
  this year, ask the accountant whether app receipts should continue that series.
