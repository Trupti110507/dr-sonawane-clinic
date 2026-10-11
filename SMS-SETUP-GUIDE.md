# Real SMS codes for patients: setup guide

Goal: every patient's own mobile number receives a real sign-in code.
Until this is finished, only the test number (98765 43210, code 123456) works.

Indian telecom rules (DLT) apply to every business that sends SMS, including
OTP messages. Unregistered messages are blocked. The steps below are done by
the clinic, because they need the clinic's documents and the clinic pays.

## Step 1: collect the documents

- PAN card of the clinic (or of the owner, if the clinic is a proprietorship)
- Business proof: GST certificate if the clinic has one, otherwise the shop
  and establishment licence or clinic registration certificate
- ID and address proof of the owner (Aadhaar or similar)
- An authorisation letter on the clinic's letterhead, signed and stamped

Exact requirements differ slightly between operators. The portal lists them
when you start the application.

## Step 2: register the clinic on ONE operator's DLT portal

Registering with one operator is enough; it is shared with all the others.

- Jio: https://trueconnect.jio.com  (MSG91 notes Jio may approve faster)
- Vi: https://www.vilpower.in
- Airtel: https://www.airtel.in/business/commercial-communication
- BSNL: https://www.ucc-bsnl.co.in

1. Choose "Register as Enterprise / Principal Entity" (NOT telemarketer).
2. Fill in the clinic's details and upload the documents.
3. Pay the registration fee. MSG91's help page lists it as Rs. 5,000 + GST.
   Confirm the current amount on the portal.
4. Wait for approval. You receive an **Entity ID** (also called PE ID).
   If nothing arrives after 2 working days, follow up with the operator.

## Step 3: register the sender name (header)

1. In the DLT portal open **Header** > **Add new**.
2. Type: **Transactional / Service** (not promotional).
3. Header: 6 letters related to the clinic name, for example `DRSNWN`.
4. Submit and wait for approval. It takes about a day to reach all operators.

## Step 4: register the message wording (template)

1. In the DLT portal open **Template** > **Add new**.
2. Type: **Transactional** or **Service Implicit**. Category: OTP.
3. Header: the one from Step 3.
4. Wording (copy exactly; `{#var#}` is where the code goes):
   ```
   {#var#} is your OTP to sign in to Dr. Sonawane Clinic. It is valid for 10 minutes. Do not share it with anyone.
   ```
5. Submit. On approval you receive a **Template ID**.

## Step 5: create the MSG91 account

1. Sign up at https://msg91.com with the clinic's email and phone.
2. Complete their KYC (same documents as Step 1).
3. In the MSG91 panel add the header and map your **Entity ID** to it.
4. Add the approved template with its **Template ID**. MSG91 gives it its own
   template (flow) ID.
5. Buy a small amount of SMS credit.
6. Copy your MSG91 **Auth Key**. Keep it private, like a password.

MSG91's DLT helpdesk can assist with Steps 2 to 4 if you get stuck.

## Step 6: connect MSG91 to the app (done together with Claude)

Send Claude a message saying Step 5 is done. Do NOT paste the Auth Key in chat.
Claude will then:

1. Add a small connector (a Supabase Edge Function) to the project.
2. Guide you to save the Auth Key and template ID as Supabase secrets.
3. Switch on Supabase's "Send SMS hook" so codes go through MSG91.
4. Test with your own mobile number.
5. Remove the test number from Supabase.

## What to send Claude when ready

- "DLT approved and MSG91 account ready"
- The header (6 letters) and the exact approved wording, if it differs from Step 4
