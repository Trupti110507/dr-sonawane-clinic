import { useId, useState, type FormEvent } from 'react';
import Field, { Notice } from '../../components/Field';
import ImageUpload from '../../components/ImageUpload';
import PortalShell, { ADMIN_LINKS } from '../../components/PortalShell';
import { friendlyError } from '../../lib/auth';
import { logoUrl, type ClinicSettings } from '../../lib/clinic';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, inputBox, pageTitle } from '../../lib/ui';

type Errors = Partial<Record<string, string>>;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const PHONE = /^\+?[0-9 ]{10,16}$/;

/** How readable white text is on a colour (WCAG contrast ratio, 1 to 21). */
function contrastWithWhite(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

export default function AdminClinic({ settings, onChanged }: { settings: ClinicSettings; onChanged: () => void }) {
  const slotId = useId();
  const [form, setForm] = useState({
    name: settings.name,
    tagline: settings.tagline ?? '',
    subtitle: settings.subtitle ?? '',
    address: settings.address,
    city: settings.city,
    phone_primary: settings.phone_primary,
    phone_secondary: settings.phone_secondary ?? '',
    email: settings.email ?? '',
    primary_color: settings.primary_color,
    accent_color: settings.accent_color,
    slot_minutes: String(settings.slot_minutes ?? 15),
    booking_window_days: String(settings.booking_window_days ?? 30),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = 'Enter the clinic or doctor name.';
    if (form.address.trim().length < 3) next.address = 'Enter the clinic address.';
    if (form.city.trim().length < 2) next.city = 'Enter the town or city.';
    if (!PHONE.test(form.phone_primary.trim())) next.phone_primary = 'Enter a phone number, for example +91 8928774097.';
    if (form.phone_secondary.trim() && !PHONE.test(form.phone_secondary.trim())) next.phone_secondary = 'Enter a phone number, or leave this empty.';
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Enter a valid email, or leave this empty.';
    if (!HEX.test(form.primary_color)) next.primary_color = 'Use a colour code like #4F7358.';
    if (!HEX.test(form.accent_color)) next.accent_color = 'Use a colour code like #B9A9D9.';
    const days = Number(form.booking_window_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) next.booking_window_days = 'Enter a number of days from 1 to 365.';
    setErrors(next);
    if (Object.keys(next).length || !supabase) return;

    setBusy(true);
    const { error } = await supabase
      .from('clinic_settings')
      .update({
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        subtitle: form.subtitle.trim() || null,
        address: form.address.trim(),
        city: form.city.trim(),
        phone_primary: form.phone_primary.trim(),
        phone_secondary: form.phone_secondary.trim() || null,
        email: form.email.trim() || null,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
        slot_minutes: Number(form.slot_minutes),
        booking_window_days: days,
      })
      .eq('id', true);
    setBusy(false);
    if (error) return setResult({ kind: 'error', text: friendlyError(error) });
    setResult({ kind: 'success', text: 'Saved. The website and all portals now show the new details.' });
    onChanged();
  }

  async function saveLogo(path: string) {
    if (!supabase) return;
    const { error } = await supabase.from('clinic_settings').update({ logo_path: path }).eq('id', true);
    if (error) setResult({ kind: 'error', text: friendlyError(error) });
    else {
      setResult({ kind: 'success', text: 'The new logo is in place.' });
      onChanged();
    }
  }

  const lowContrast = HEX.test(form.primary_color) && contrastWithWhite(form.primary_color) < 4.5;

  return (
    <PortalShell label="Admin portal" links={ADMIN_LINKS}>
      <h1 className={pageTitle}>Clinic details</h1>

      <section className={`${card} mt-6 max-w-3xl`} aria-label="Logo">
        <ImageUpload
          label="Logo"
          hint="PNG, JPG or WebP, up to 2 MB. A square image with a clear background works best."
          prefix="logo"
          currentUrl={logoUrl(settings)}
          onUploaded={(path) => void saveLogo(path)}
        />
      </section>

      <form onSubmit={save} noValidate className="mt-6 max-w-3xl space-y-6">
        <section className={`${card} space-y-5`}>
          <h2 className="font-display text-2xl">Name and headings</h2>
          <Field label="Name" hint="The main heading on the website" value={form.name} onChange={set('name')} error={errors.name} />
          <Field label="Subheading 1" value={form.tagline} onChange={set('tagline')} maxLength={120} />
          <Field label="Subheading 2" value={form.subtitle} onChange={set('subtitle')} maxLength={120} />
        </section>

        <section className={`${card} space-y-5`}>
          <h2 className="font-display text-2xl">Address and contact</h2>
          <Field label="Address" value={form.address} onChange={set('address')} error={errors.address} />
          <Field label="Town or city" value={form.city} onChange={set('city')} error={errors.city} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Main phone" inputMode="tel" value={form.phone_primary} onChange={set('phone_primary')} error={errors.phone_primary} />
            <Field label="Second phone" hint="Optional" inputMode="tel" value={form.phone_secondary} onChange={set('phone_secondary')} error={errors.phone_secondary} />
          </div>
          <Field label="Email" hint="Optional" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        </section>

        <section className={`${card} space-y-5`}>
          <h2 className="font-display text-2xl">Brand colours</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ColourField label="Main colour" hint="Buttons and links" value={form.primary_color} onChange={(v) => setForm({ ...form, primary_color: v })} error={errors.primary_color} />
            <ColourField label="Accent colour" hint="Highlights and badges" value={form.accent_color} onChange={(v) => setForm({ ...form, accent_color: v })} error={errors.accent_color} />
          </div>
          {lowContrast && (
            <Notice kind="info">
              This main colour is light, so the white text on buttons will be hard to read. A darker
              shade is easier for patients with weak eyesight.
            </Notice>
          )}
        </section>

        <section className={`${card} space-y-5`}>
          <h2 className="font-display text-2xl">Appointment settings</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={slotId} className="block font-semibold text-ink">
                Length of one appointment
              </label>
              <select id={slotId} className={inputBox} value={form.slot_minutes} onChange={set('slot_minutes')}>
                {[10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <Field label="Patients can book up to" hint="Days ahead" inputMode="numeric" value={form.booking_window_days} onChange={set('booking_window_days')} error={errors.booking_window_days} />
          </div>
        </section>

        {result && <Notice kind={result.kind}>{result.text}</Notice>}
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save clinic details'}
        </button>
      </form>
    </PortalShell>
  );
}

function ColourField({ label, hint, value, onChange, error }: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
      </label>
      <p className="text-[0.95rem] text-muted">{hint}</p>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="h-12 w-14 shrink-0 cursor-pointer rounded-xl border border-[#b9c4bb] bg-white p-1"
          value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input id={id} className={`${inputBox} mt-0`} value={value} maxLength={7} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{error}</p>}
    </div>
  );
}
