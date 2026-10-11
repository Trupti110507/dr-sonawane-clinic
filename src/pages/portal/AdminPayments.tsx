import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import ReceiptSheet from '../../components/ReceiptSheet';
import { addDays, showPhone, timeOf } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { clinicDate, formatDate, formatInr, type ClinicData } from '../../lib/clinic';
import { DESK_METHODS, METHOD_LABEL, summarise, toCsv, type Billable, type Payment, type PaymentMethod } from '../../lib/payments';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnOutline, btnPrimary, btnSmall, card, inputBox, pageTitle } from '../../lib/ui';

interface PatientOption {
  user_id: string;
  full_name: string;
  phone: string | null;
}

/** What the payment form is for: an appointment on the day list, or something else for a chosen patient. */
type Target = { kind: 'appointment'; row: Billable } | { kind: 'other' };

export default function AdminPayments({ clinic, onChanged }: { clinic: ClinicData; onChanged: () => void }) {
  const { settings } = clinic;
  const tz = settings.timezone;
  const today = clinicDate(tz);
  const dayId = useId();
  const fromId = useId();
  const toId = useId();

  const [day, setDay] = useState(today);
  const [bills, setBills] = useState<Billable[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refunding, setRefunding] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBills = useCallback(async () => {
    if (!supabase || !day) return;
    const { data, error: failed } = await supabase.rpc('appointments_to_bill', { p_date: day });
    if (failed) setError(friendlyError(failed));
    setBills((data as Billable[]) ?? []);
  }, [day]);

  const loadRows = useCallback(async () => {
    if (!supabase || !from || !to) return;
    if (to < from) return setError('The "To" date must be on or after the "From" date.');
    const { data, error: failed } = await supabase.rpc('list_payments', { p_from: from, p_to: to });
    if (failed) setError(friendlyError(failed));
    else setError('');
    setRows((data as Payment[]) ?? []);
  }, [from, to]);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function saved(receiptNo: string) {
    setTarget(null);
    setNotice(`Payment recorded. Receipt ${receiptNo}.`);
    void loadBills();
    void loadRows();
  }

  async function refund(id: string) {
    if (!reason.trim()) return setError('Say why the payment is refunded.');
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('refund_payment', { p_id: id, p_reason: reason });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    setRefunding('');
    setReason('');
    setNotice('Refund recorded. Remember to give the money back.');
    void loadBills();
    void loadRows();
  }

  async function setOnline(on: boolean) {
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc('set_online_payments', { p_on: on });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    setNotice(on ? 'Online payment is switched on.' : 'Online payment is switched off.');
    onChanged();
  }

  function download() {
    // The first character tells spreadsheet programs the file is UTF-8, so names and the rupee sign read correctly.
    const file = new Blob(['﻿' + toCsv(rows ?? [])], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `payments-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const totals = summarise(rows ?? []);
  // The same appointment paid more than once (for example online and again at the desk).
  const paidTwice = new Set(
    (rows ?? []).filter((r) => r.status === 'paid' && r.appointment_id && (rows ?? []).filter((x) => x.status === 'paid' && x.appointment_id === r.appointment_id).length > 1).map((r) => r.id),
  );
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Payments</h1>
      {error && (
        <div className="mt-6 max-w-4xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && !error && (
        <div className="mt-6 max-w-4xl">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}

      {/* ---------- take a payment ---------- */}
      <section className="mt-8 max-w-4xl" aria-labelledby="take-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="take-title" className="font-display text-2xl">
              Take a payment
            </h2>
            <label htmlFor={dayId} className="mt-2 block font-semibold text-ink">
              Appointments on
            </label>
            <input id={dayId} type="date" className={`${inputBox} max-w-[12rem]`} value={day} max={addDays(today, 60)} onChange={(e) => { setTarget(null); setDay(e.target.value); }} />
          </div>
          {target === null && (
            <button className={btnOutline} onClick={() => { setError(''); setNotice(''); setTarget({ kind: 'other' }); }}>
              Other payment
            </button>
          )}
        </div>

        {target?.kind === 'other' && <PaymentForm target={target} onClose={() => setTarget(null)} onSaved={saved} />}

        {bills === null ? (
          <p role="status" className="mt-4 text-muted">Loading appointments…</p>
        ) : bills.length === 0 ? (
          <p className="mt-4 text-muted">No appointments on {formatDate(day)}.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {bills.map((b) => (
              <li key={b.appointment_id} className="py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-ink">
                      {timeOf(b.starts_at, tz)} · {b.patient_name || 'Name not given'}
                    </p>
                    <p className="text-[0.95rem] text-muted">
                      {b.service_name}, {b.doctor_name}, fee {formatInr(b.price_inr)}
                    </p>
                  </div>
                  {b.receipt_no ? (
                    <p className="shrink-0 rounded-full bg-sage-100 px-3 py-1 text-[0.95rem] font-semibold text-sage-900">
                      Paid {formatInr(b.paid_inr ?? 0)} · {b.receipt_no}
                    </p>
                  ) : (
                    !(target?.kind === 'appointment' && target.row.appointment_id === b.appointment_id) && (
                      <button className={`${btnPrimary} shrink-0`} onClick={() => { setError(''); setNotice(''); setTarget({ kind: 'appointment', row: b }); }}>
                        Take payment
                      </button>
                    )
                  )}
                </div>
                {target?.kind === 'appointment' && target.row.appointment_id === b.appointment_id && (
                  <PaymentForm target={target} onClose={() => setTarget(null)} onSaved={saved} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- payments received ---------- */}
      <section className="mt-12 max-w-4xl" aria-labelledby="received-title">
        <h2 id="received-title" className="font-display text-2xl">
          Payments received
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={fromId} className="block font-semibold text-ink">
              From
            </label>
            <input id={fromId} type="date" className={inputBox} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor={toId} className="block font-semibold text-ink">
              To
            </label>
            <input id={toId} type="date" className={inputBox} value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className={btnSmall} onClick={() => { setFrom(today); setTo(today); }}>
            Today
          </button>
          <button className={btnSmall} onClick={() => { setFrom(monthStart); setTo(today); }}>
            This month
          </button>
        </div>

        {rows === null ? (
          <p role="status" className="mt-4 text-muted">Loading payments…</p>
        ) : (
          <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className={card}>
                <dt className="text-muted">Received</dt>
                <dd className="font-display text-3xl text-ink">{formatInr(totals.received)}</dd>
                <dd className="text-[0.95rem] text-muted">
                  {totals.receivedCount} {totals.receivedCount === 1 ? 'payment' : 'payments'}
                </dd>
              </div>
              <div className={card}>
                <dt className="text-muted">By method</dt>
                {totals.byMethod.length === 0 ? (
                  <dd className="text-muted">Nothing yet</dd>
                ) : (
                  totals.byMethod.map((m) => (
                    <dd key={m.method} className="flex justify-between gap-3 text-ink">
                      <span>
                        {METHOD_LABEL[m.method]} ({m.count})
                      </span>
                      <span className="font-semibold">{formatInr(m.total)}</span>
                    </dd>
                  ))
                )}
              </div>
              <div className={card}>
                <dt className="text-muted">Refunded</dt>
                <dd className="font-display text-3xl text-ink">{formatInr(totals.refunded)}</dd>
                <dd className="text-[0.95rem] text-muted">
                  {totals.refundedCount} {totals.refundedCount === 1 ? 'payment' : 'payments'}, not counted in Received
                </dd>
              </div>
            </dl>

            {totals.byDay.length > 1 && (
              <table className="mt-5 w-full max-w-md text-left">
                <caption className="pb-2 text-left font-semibold text-ink">Received each day</caption>
                <thead>
                  <tr className="border-b border-line text-[0.95rem] text-muted">
                    <th scope="col" className="py-2 font-normal">Day</th>
                    <th scope="col" className="py-2 text-right font-normal">Payments</th>
                    <th scope="col" className="py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.byDay.map((d) => (
                    <tr key={d.day} className="border-b border-line">
                      <td className="py-2 text-ink">{formatDate(d.day)}</td>
                      <td className="py-2 text-right text-ink">{d.count}</td>
                      <td className="py-2 text-right font-semibold text-ink">{formatInr(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {rows.length === 0 ? (
              <p className="mt-5 text-muted">No payments in this period.</p>
            ) : (
              <>
                <button className={`${btnSmall} mt-5`} onClick={download}>
                  Download as a spreadsheet file
                </button>
                <ul className="mt-4 space-y-4">
                  {rows.map((r) => (
                    <li key={r.id}>
                      {paidTwice.has(r.id) && (
                        <div className="mb-2">
                          <Notice kind="info">This appointment has been paid for more than once. Refund one of the payments.</Notice>
                        </div>
                      )}
                      <ReceiptSheet
                        payment={r}
                        patientName={`${r.patient_name || 'Name not given'}${r.patient_phone ? `, ${showPhone(r.patient_phone)}` : ''}`}
                        settings={settings}
                        actions={
                          r.status === 'paid' && refunding !== r.id ? (
                            <button className={btnSmall} onClick={() => { setError(''); setNotice(''); setReason(''); setRefunding(r.id); }}>
                              Refund
                            </button>
                          ) : undefined
                        }
                      />
                      {refunding === r.id && (
                        <form
                          noValidate
                          className={`${card} mt-2 space-y-4 border-[#e3b9b6]`}
                          onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            void refund(r.id);
                          }}
                        >
                          <p className="text-ink">
                            This records that {formatInr(r.amount_inr)} was given back. It does not move any money:{' '}
                            {r.method === 'online' ? 'send the refund from the Razorpay dashboard.' : 'hand the money back to the patient.'} The receipt stays on record, marked Refunded.
                          </p>
                          <Field label="Reason for the refund" value={reason} maxLength={300} onChange={(e) => { setError(''); setReason(e.target.value); }} />
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="submit" disabled={busy} className={btnDanger}>
                              {busy ? 'Recording…' : 'Record refund'}
                            </button>
                            <button type="button" className={btnSmall} onClick={() => setRefunding('')}>
                              Keep the payment
                            </button>
                          </div>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {/* ---------- online payment switch ---------- */}
      <section className={`${card} mt-12 max-w-4xl`} aria-labelledby="online-title">
        <h2 id="online-title" className="font-display text-2xl">
          Online payment
        </h2>
        <p className="mt-2 text-ink">
          {settings.online_payments
            ? 'On. Patients see a "Pay online" button for upcoming appointments.'
            : 'Off. Patients are told to pay at the clinic.'}
        </p>
        <p className="mt-1 text-[0.95rem] text-muted">
          Switch this on only after the clinic's Razorpay account and the payment server function are set up, as described in STAGE8-GUIDE.md.
        </p>
        <button className={`${settings.online_payments ? btnSmall : btnOutline} mt-4`} disabled={busy} onClick={() => void setOnline(!settings.online_payments)}>
          {settings.online_payments ? 'Switch online payment off' : 'Switch online payment on'}
        </button>
      </section>
    </PortalShell>
  );
}

/** Amount, method and (for a payment without an appointment) patient and description. */
function PaymentForm({ target, onClose, onSaved }: { target: Target; onClose: () => void; onSaved: (receiptNo: string) => void }) {
  const patientId = useId();
  const row = target.kind === 'appointment' ? target.row : null;
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(row ? String(row.price_inr) : '');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<{ patient?: string; description?: string; amount?: string; method?: string }>({});

  useEffect(() => {
    if (row || !supabase) return;
    supabase
      .from('profiles')
      .select('user_id, full_name, phone')
      .eq('role', 'patient')
      .order('full_name')
      .then(({ data }) => setPatients((data as PatientOption[]) ?? []));
  }, [row]);

  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const matches = patients.filter((p) => !q || p.full_name.toLowerCase().includes(q) || (digits !== '' && (p.phone ?? '').includes(digits)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const rupees = Number(amount);
    const found: typeof problems = {};
    if (!row && !patient) found.patient = 'Choose the patient.';
    if (!row && description.trim().length < 2) found.description = 'Say what the payment is for.';
    if (!/^\d+$/.test(amount.trim()) || rupees < 1 || rupees > 500000) found.amount = 'Enter the amount in whole rupees, for example 300.';
    if (!method) found.method = 'Choose how the patient paid.';
    setProblems(found);
    if (Object.keys(found).length || !supabase) return;
    setBusy(true);
    const { data, error: failed } = await supabase.rpc('record_desk_payment', {
      p_patient_id: row ? row.patient_id : patient,
      p_amount_inr: rupees,
      p_method: method,
      p_description: row ? null : description,
      p_appointment_id: row ? row.appointment_id : null,
    });
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    onSaved((data as { receipt_no: string }).receipt_no);
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-4 space-y-5 border-sage-300`}>
      <h3 className="font-display text-2xl">{row ? `Payment from ${row.patient_name || 'this patient'}` : 'Other payment'}</h3>
      {!row && (
        <>
          <Field label="Find the patient" hint="Type part of the name or mobile number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div>
            <label htmlFor={patientId} className="block font-semibold text-ink">
              Patient
            </label>
            <select id={patientId} className={inputBox} value={patient} aria-invalid={problems.patient ? true : undefined} onChange={(e) => setPatient(e.target.value)}>
              <option value="">Choose a patient</option>
              {matches.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || 'Name not given'} · {showPhone(p.phone)}
                </option>
              ))}
            </select>
            {problems.patient && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{problems.patient}</p>}
          </div>
          <Field label="What is the payment for?" hint="For example Chemical peel, session 2" value={description} maxLength={200} error={problems.description} onChange={(e) => setDescription(e.target.value)} />
        </>
      )}
      <Field
        className="max-w-[14rem]"
        label="Amount in rupees"
        hint={row ? `The fee for ${row.service_name} is ${formatInr(row.price_inr)}` : undefined}
        inputMode="numeric"
        prefix="₹"
        value={amount}
        maxLength={6}
        error={problems.amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <fieldset>
        <legend className="font-semibold text-ink">Paid by</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESK_METHODS.map((m) => (
            <label key={m} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 font-semibold ${method === m ? 'border-sage-600 bg-sage-600 text-white' : 'border-sage-300 bg-white text-sage-700'}`}>
              <input type="radio" name="method" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
        {problems.method && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{problems.method}</p>}
      </fieldset>
      {error && <Notice kind="error">{error}</Notice>}
      <p className="text-[0.95rem] text-muted">Check the amount before saving. A saved payment cannot be edited, only refunded.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save payment and issue receipt'}
        </button>
        <button type="button" className={btnOutline} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
