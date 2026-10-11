import { Link } from 'react-router-dom';
import {
  clinicDate,
  formatDate,
  formatInr,
  imageUrl,
  formatTime,
  groupWeek,
  sessionLabel,
  telHref,
  todayStatus,
  weekdayName,
  type ClinicData,
} from '../lib/clinic';

// Shared button looks. One filled button per area; the rest are outlined.
const btnPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-sage-600 px-7 font-semibold text-white hover:bg-sage-700';
const btnOutline =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-sage-300 bg-white px-7 font-semibold text-sage-700 hover:bg-sage-50';
const sectionTitle = 'font-display text-3xl text-ink sm:text-4xl';
const textLink =
  'inline-flex min-h-11 items-center gap-2 font-semibold text-sage-700 underline decoration-sage-300 underline-offset-4 hover:decoration-sage-700';

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z" />
      <circle cx="12" cy="9.500" r="2.500" />
    </svg>
  );
}

export default function Welcome({ clinic }: { clinic: ClinicData }) {
  const { settings, hours, services, doctors, holidays } = clinic;
  const status = todayStatus(hours, settings.timezone, new Date(), holidays);
  const todayIso = clinicDate(settings.timezone);
  const upcomingHolidays = holidays.filter((h) => h.holiday_date >= todayIso).slice(0, 4);
  const fullAddress = `${settings.address}, ${settings.city}`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${settings.name}, ${fullAddress}`,
  )}`;
  const categories = [...new Set(services.map((s) => s.category))];
  const phones = [settings.phone_primary, settings.phone_secondary].filter(
    (p): p is string => Boolean(p),
  );
  return (
    // Bottom padding on phones leaves room for the fixed Call / Book bar.
    <main id="main" className="pb-20 md:pb-0">
      {/* ---------- Hero: who we are + what is happening today ---------- */}
      <section className="bg-sage-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-20">
          <div>
            <h1 className="font-display text-[2.75rem] leading-[1.1] text-ink sm:text-6xl lg:text-[4rem]">
              {settings.name}
            </h1>
            {settings.tagline && (
              <p className="mt-4 font-display text-2xl leading-snug text-sage-700 sm:text-[1.75rem]">
                {settings.tagline}
              </p>
            )}
            {settings.subtitle && (
              <p className="mt-2 text-lg font-medium text-ink sm:text-xl">{settings.subtitle}</p>
            )}
            <p className="mt-5 flex items-start gap-2 text-ink">
              <span className="mt-0.5 text-sage-600">
                <PinIcon />
              </span>
              {fullAddress}
            </p>
            {/* On phones these two actions live in the fixed bar at the bottom */}
            <div className="mt-8 hidden gap-3 md:flex">
              <Link to="/book" className={btnPrimary}>
                Book appointment
              </Link>
              <a href={telHref(settings.phone_primary)} className={btnOutline}>
                <PhoneIcon />
                Call {settings.phone_primary}
              </a>
            </div>
          </div>

          {/* The "today" panel: the one strong block on the page */}
          <aside
            aria-label="Today at the clinic"
            className="rounded-[28px] bg-sage-900 p-6 text-white sm:p-8"
          >
            <p className="text-[0.95rem] text-sage-200">Today, {weekdayName(status.weekday)}</p>
            <p className="mt-2 flex items-center gap-3 font-display text-3xl sm:text-4xl">
              <span
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full ${
                  status.open ? 'bg-[#8fe0a4]' : 'bg-lavender-400'
                }`}
              />
              {status.headline}
            </p>
            <p className="mt-1 text-sage-200">{status.detail}</p>

            {status.todaySessions.length > 0 && (
              <dl className="mt-6 space-y-2 border-t border-white/15 pt-5">
                {status.todaySessions.map(([from, to]) => (
                  <div key={from} className="flex justify-between gap-4">
                    <dt className="text-sage-200">{sessionLabel(from)}</dt>
                    <dd className="font-semibold">
                      {formatTime(from)} to {formatTime(to)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {services.length > 0 && (
              <dl className="mt-5 space-y-2 border-t border-white/15 pt-5">
                {services.slice(0, 2).map((service) => (
                  <div key={service.id} className="flex justify-between gap-4">
                    <dt className="text-sage-200">{service.name}</dt>
                    <dd className="font-semibold">{formatInr(service.price_inr)}</dd>
                  </div>
                ))}
              </dl>
            )}

            <a
              href="#visit"
              className="mt-6 inline-flex min-h-11 items-center font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
            >
              See all clinic hours
            </a>
          </aside>
        </div>
      </section>

      {/* ---------- Services and fees ---------- */}
      <section aria-labelledby="services" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 id="services" className={sectionTitle}>
          Services and fees
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Fees are paid at the clinic. Procedures are advised only after the doctor has examined you.
        </p>
        <div className="mt-10 grid gap-x-16 gap-y-12 md:grid-cols-2">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="border-b-2 border-lavender-400 pb-3 font-display text-2xl text-ink">
                {category}
              </h3>
              <ul className="divide-y divide-line">
                {services
                  .filter((s) => s.category === category)
                  .map((service) => (
                    <li key={service.id} className="flex items-start justify-between gap-6 py-4">
                      <div>
                        <p className="text-[1.05rem] font-semibold text-ink">{service.name}</p>
                        {service.description && (
                          <p className="mt-0.5 text-[0.95rem] text-muted">{service.description}</p>
                        )}
                        <p className="mt-0.5 text-[0.95rem] text-muted">
                          About {service.duration_minutes} minutes
                        </p>
                      </div>
                      <p className="shrink-0 text-[1.05rem] font-bold text-ink">
                        {formatInr(service.price_inr)}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Doctors ---------- */}
      <section aria-labelledby="doctors" className="bg-lavender-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 id="doctors" className={sectionTitle}>
            Our doctors
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {doctors.map((doctor) => (
              <li key={doctor.id} className="flex gap-4 rounded-2xl bg-white p-5 sm:p-6">
                {imageUrl(doctor.photo_path) ? (
                  <img
                    src={imageUrl(doctor.photo_path)!}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700"
                  >
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <circle cx="12" cy="8.500" r="3.500" />
                      <path d="M5 20c.600-3.600 3.400-5.500 7-5.500s6.400 1.900 7 5.500" />
                    </svg>
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="text-[1.05rem] font-bold text-ink">{doctor.full_name}</h3>
                  {doctor.qualification && (
                    <p className="text-[0.95rem] text-muted">{doctor.qualification}</p>
                  )}
                  {doctor.specialities && (
                    <p className="mt-2 text-[0.95rem] text-ink">{doctor.specialities}</p>
                  )}
                  {doctor.consultation_fee_inr !== null && (
                    <p className="mt-2 text-[0.95rem] text-muted">
                      Consultation{' '}
                      <span className="font-bold text-ink">
                        {formatInr(doctor.consultation_fee_inr)}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Hours and location ---------- */}
      <section aria-labelledby="visit" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 id="visit" className={sectionTitle}>
          Hours and location
        </h2>
        <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          {/* One block per run of days that share the same hours */}
          <div className="self-start border-t border-line">
            {groupWeek(hours).map((group) => {
              const isToday = group.weekdays.includes(status.weekday);
              return (
                <div
                  key={group.label}
                  className={`border-b border-line px-4 py-5 ${isToday ? 'bg-sage-50' : ''}`}
                >
                  <h3 className="flex flex-wrap items-center gap-2 text-[1.05rem] font-bold text-ink">
                    {group.label}
                    {isToday && (
                      <span className="rounded-full bg-lavender-200 px-2 py-0.5 text-sm font-semibold text-lavender-700">
                        Today
                      </span>
                    )}
                  </h3>
                  {group.sessions.length === 0 ? (
                    <p className="mt-1 text-muted">Closed</p>
                  ) : (
                    <dl className="mt-2 space-y-1">
                      {group.sessions.map(([from, to]) => (
                        <div key={from} className="flex justify-between gap-4">
                          <dt className="text-muted">{sessionLabel(from)}</dt>
                          <dd className="font-semibold text-ink">
                            {formatTime(from)} to {formatTime(to)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
            {upcomingHolidays.length > 0 && (
              <div className="px-4 py-5">
                <h3 className="text-[1.05rem] font-bold text-ink">Closed on these days</h3>
                <ul className="mt-2 space-y-1">
                  {upcomingHolidays.map((h) => (
                    <li key={h.holiday_date} className="flex justify-between gap-4">
                      <span className="text-ink">{formatDate(h.holiday_date)}</span>
                      <span className="text-right text-muted">{h.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-display text-2xl text-ink">Find us</h3>
            <address className="mt-3 text-[1.05rem] not-italic leading-relaxed text-ink">
              {[settings.name, settings.subtitle].filter(Boolean).join(', ')}
              <br />
              {settings.address}
              <br />
              {settings.city}
            </address>
            <a href={mapUrl} target="_blank" rel="noreferrer" className={`${textLink} mt-2`}>
              <PinIcon />
              Get directions in Google Maps
            </a>

            <h3 className="mt-8 font-display text-2xl text-ink">Call the clinic</h3>
            <ul className="mt-1">
              {phones.map((phone) => (
                <li key={phone}>
                  <a href={telHref(phone)} className={textLink}>
                    <PhoneIcon />
                    {phone}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="bg-sage-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <p className="font-display text-2xl">{settings.name}</p>
            {settings.tagline && <p className="mt-1 text-sage-200">{settings.tagline}</p>}
            {settings.subtitle && <p className="text-sage-200">{settings.subtitle}</p>}
          </div>
          <address className="not-italic leading-relaxed text-sage-200">
            {settings.address}
            <br />
            {settings.city}
          </address>
          <ul>
            {phones.map((phone) => (
              <li key={phone}>
                <a href={telHref(phone)} className="inline-flex min-h-9 items-center text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                  {phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {/* ---------- Phone-only action bar, always within thumb reach ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <a href={telHref(settings.phone_primary)} className={`${btnOutline} px-6`}>
          <PhoneIcon />
          Call
        </a>
        <Link to="/book" className={`${btnPrimary} flex-1 whitespace-nowrap px-4`}>
          Book appointment
        </Link>
      </div>
    </main>
  );
}
