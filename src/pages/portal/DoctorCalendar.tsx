import { useState } from 'react';
import AppointmentItem from '../../components/AppointmentItem';
import { Notice } from '../../components/Field';
import PortalShell, { DOCTOR_LINKS } from '../../components/PortalShell';
import { STATUS_LOOK, addDays, dayOf, shortDate, timeOf, weekdayOf, type Appointment } from '../../lib/appointments';
import { clinicDate, formatDate, type ClinicData } from '../../lib/clinic';
import { useAppointments } from '../../lib/useAppointments';
import { btnSmall, pageTitle } from '../../lib/ui';

type View = 'day' | 'week' | 'month';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Monday of the week containing this day. */
const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
const daysInMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();

export default function DoctorCalendar({ clinic }: { clinic: ClinicData }) {
  const tz = clinic.settings.timezone;
  const today = clinicDate(tz);
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(today);

  // The range of days on screen.
  const from = view === 'day' ? anchor : view === 'week' ? mondayOf(anchor) : mondayOf(firstOfMonth(anchor));
  const to =
    view === 'day' ? anchor : view === 'week' ? addDays(from, 6) : addDays(mondayOf(addDays(firstOfMonth(anchor), daysInMonth(anchor) - 1)), 6);
  const { rows, error, reload } = useAppointments(from, to);

  const byDay = new Map<string, Appointment[]>();
  for (const a of rows ?? []) {
    const d = dayOf(a.starts_at, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const live = (d: string) => (byDay.get(d) ?? []).filter((a) => a.status !== 'cancelled');

  function step(direction: number) {
    if (view === 'day') setAnchor(addDays(anchor, direction));
    else if (view === 'week') setAnchor(addDays(anchor, 7 * direction));
    else {
      const y = Number(anchor.slice(0, 4));
      const m = Number(anchor.slice(5, 7)) - 1 + direction;
      setAnchor(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
    }
  }

  const title =
    view === 'day'
      ? formatDate(anchor)
      : view === 'week'
        ? `${shortDate(from).day} ${shortDate(from).month} to ${shortDate(to).day} ${shortDate(to).month} ${to.slice(0, 4)}`
        : `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;

  const tab = (v: View) => `min-h-11 rounded-full px-4 font-semibold ${view === v ? 'bg-sage-600 text-white' : 'text-sage-700 hover:bg-sage-50'}`;
  const allDays = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }, (_, i) => addDays(from, i));

  return (
    <PortalShell label="Doctor portal" links={DOCTOR_LINKS}>
      <h1 className={pageTitle}>Calendar</h1>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Calendar view" className="inline-flex w-fit gap-1 rounded-full border border-line bg-white p-1">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={tab(v)} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnSmall} onClick={() => step(-1)} aria-label={`Previous ${view}`}>
            Previous
          </button>
          <button className={btnSmall} onClick={() => setAnchor(today)}>
            Today
          </button>
          <button className={btnSmall} onClick={() => step(1)} aria-label={`Next ${view}`}>
            Next
          </button>
        </div>
      </div>
      <h2 className="mt-5 font-display text-2xl" aria-live="polite">
        {title}
      </h2>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {rows === null ? (
        <p role="status" className="mt-4 text-muted">Loading…</p>
      ) : view === 'day' ? (
        (byDay.get(anchor) ?? []).length === 0 ? (
          <p className="mt-4 text-muted">No appointments on this day.</p>
        ) : (
          <ul className="mt-2 max-w-3xl divide-y divide-line border-y border-line">
            {(byDay.get(anchor) ?? []).map((a) => (
              <AppointmentItem key={a.id} appointment={a} clinic={clinic} viewer="doctor" onChanged={() => void reload()} />
            ))}
          </ul>
        )
      ) : view === 'week' ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-7">
          {allDays.map((d) => (
            <section key={d} className={`rounded-2xl border p-3 ${d === today ? 'border-sage-600 bg-sage-50' : 'border-line bg-white'}`}>
              <button className="w-full text-left font-bold text-ink underline-offset-4 hover:underline" onClick={() => { setAnchor(d); setView('day'); }}>
                {shortDate(d).weekday} {shortDate(d).day} {shortDate(d).month}
                {d === today && <span className="ml-2 font-normal text-muted">Today</span>}
              </button>
              {live(d).length === 0 ? (
                <p className="mt-1 text-[0.95rem] text-muted">None</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {live(d).map((a) => (
                    <li key={a.id} className={`rounded-lg px-2 py-1 text-[0.95rem] ${STATUS_LOOK[a.status]}`}>
                      <span className="font-semibold">{timeOf(a.starts_at, tz)}</span> {a.patient_name || 'Patient'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] table-fixed border-collapse">
            <caption className="sr-only">Appointments in {title}. Choose a day to see its list.</caption>
            <thead>
              <tr>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <th key={d} scope="col" className="border-b border-line py-2 text-left text-[0.95rem] font-medium text-muted">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: allDays.length / 7 }, (_, w) => (
                <tr key={w}>
                  {allDays.slice(w * 7, w * 7 + 7).map((d) => {
                    const count = live(d).length;
                    const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
                    return (
                      <td key={d} className="border-b border-line p-1 align-top">
                        <button
                          className={`flex min-h-[4.5rem] w-full flex-col rounded-xl p-2 text-left hover:bg-sage-50 ${d === today ? 'bg-sage-50 ring-1 ring-sage-600' : ''} ${inMonth ? 'text-ink' : 'text-[#9aa19c]'}`}
                          aria-label={`${formatDate(d)}, ${count} ${count === 1 ? 'appointment' : 'appointments'}`}
                          onClick={() => { setAnchor(d); setView('day'); }}
                        >
                          <span className="font-bold">{Number(d.slice(8))}</span>
                          {count > 0 && (
                            <span className="mt-1 w-fit rounded-full bg-lavender-200 px-2 py-0.5 text-sm font-semibold text-lavender-700">{count}</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
