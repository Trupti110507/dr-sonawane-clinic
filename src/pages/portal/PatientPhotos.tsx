import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Notice } from '../../components/Field';
import PortalShell, { PATIENT_LINKS } from '../../components/PortalShell';
import { dayOf } from '../../lib/appointments';
import { friendlyError } from '../../lib/auth';
import { formatDate, telHref, type ClinicData } from '../../lib/clinic';
import { CONSENT_WORDING, byArea, openPhoto, signedLinks, type PhotoSet } from '../../lib/photos';
import { supabase } from '../../lib/supabase';
import { btnDanger, btnPrimary, btnSmall, card, pageTitle, textLink } from '../../lib/ui';

/** The patient's consent to clinical photographs, and the photos their doctor has shared with them. */
export default function PatientPhotos({ clinic }: { clinic: ClinicData }) {
  const tz = clinic.settings.timezone;
  const agreeId = useId();
  const [set, setSet] = useState<PhotoSet | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: failed } = await supabase.rpc('my_photos');
    if (failed) {
      setError(friendlyError(failed));
      return setSet({ consent: null, photos: [] });
    }
    const loaded = (data as PhotoSet | null) ?? { consent: null, photos: [] };
    setSet(loaded);
    setLinks(await signedLinks(loaded.photos.map((p) => p.storage_path)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: string, args: Record<string, unknown>, done: string) {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { error: failed } = await supabase.rpc(fn, args);
    setBusy(false);
    if (failed) return setError(friendlyError(failed));
    setNotice(done);
    setWithdrawing(false);
    setAgreed(false);
    void load();
  }

  return (
    <PortalShell label="Patient portal" links={PATIENT_LINKS}>
      <h1 className={pageTitle}>Photos</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Your doctor may photograph the treated area to follow your progress. This happens only if you agree.
      </p>
      {error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && !error && (
        <div className="mt-6 max-w-3xl">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}

      {set === null ? (
        <p role="status" className="mt-6 text-muted">Loading…</p>
      ) : (
        <>
          <section className={`${card} mt-6 max-w-3xl`} aria-labelledby="consent-title">
            <h2 id="consent-title" className="font-display text-2xl">
              Your consent
            </h2>
            {set.consent ? (
              <>
                <p className="mt-2 text-ink">
                  You agreed to clinical photographs on {formatDate(dayOf(set.consent.given_at, tz))}
                  {set.consent.method === 'at_clinic' ? ', at the clinic' : ''}.
                </p>
                <details className="mt-3">
                  <summary className={`${textLink} cursor-pointer`}>Read what you agreed to</summary>
                  <p className="mt-2 rounded-xl bg-sage-50 p-4 text-ink">{CONSENT_WORDING}</p>
                </details>
                {withdrawing ? (
                  <div className="mt-4 rounded-2xl border border-[#e3b9b6] p-4">
                    <p className="text-ink">
                      After you withdraw, no new photographs will be taken. To have existing photographs deleted, ask your doctor or call{' '}
                      <a href={telHref(clinic.settings.phone_primary)} className={textLink}>
                        {clinic.settings.phone_primary}
                      </a>
                      .
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button disabled={busy} className={btnDanger} onClick={() => void run('withdraw_photo_consent', {}, 'Your consent is withdrawn. No new photographs will be taken.')}>
                        Withdraw my consent
                      </button>
                      <button className={btnSmall} onClick={() => setWithdrawing(false)}>
                        Keep my consent
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className={`${btnSmall} mt-4`} onClick={() => setWithdrawing(true)}>
                    Withdraw consent
                  </button>
                )}
              </>
            ) : (
              <form
                noValidate
                className="mt-3 space-y-4"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!agreed) return setError('Tick the box if you agree. You are free not to.');
                  void run('give_photo_consent', { p_agree: true, p_wording: CONSENT_WORDING }, 'Thank you. Your consent is recorded.');
                }}
              >
                <p className="text-ink">You have not agreed to photographs. Agreeing is your choice, and your treatment does not depend on it.</p>
                <p className="rounded-xl bg-sage-50 p-4 text-ink">{CONSENT_WORDING}</p>
                <div className="flex items-start gap-3">
                  <input id={agreeId} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={agreed} onChange={(e) => { setError(''); setAgreed(e.target.checked); }} />
                  <label htmlFor={agreeId} className="text-ink">
                    I have read this and I agree.
                  </label>
                </div>
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? 'Saving…' : 'Give consent'}
                </button>
              </form>
            )}
          </section>

          <section className="mt-10 max-w-3xl" aria-labelledby="shared-title">
            <h2 id="shared-title" className="font-display text-2xl">
              Photos shared with you
            </h2>
            {set.photos.length === 0 ? (
              <p className="mt-3 text-muted">Your doctor has not shared any photos with you yet.</p>
            ) : (
              byArea(set.photos).map(([area, photos]) => (
                <div key={area} className="mt-5">
                  <h3 className="text-[1.05rem] font-bold text-ink">{area}</h3>
                  <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                    {photos.map((p) => (
                      <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                        <button className="block w-full bg-sage-50" onClick={() => void openPhoto(p.storage_path)} aria-label={`Open the photo of ${formatDate(p.taken_on)} at full size`}>
                          {links[p.storage_path] ? (
                            <img src={links[p.storage_path]} alt={`${area}, ${formatDate(p.taken_on)}`} className="aspect-[4/3] w-full object-cover" />
                          ) : (
                            <span className="flex aspect-[4/3] items-center justify-center text-muted">Photo not available</span>
                          )}
                        </button>
                        <div className="p-4">
                          <p className="font-semibold text-ink">{formatDate(p.taken_on)}</p>
                          <p className="text-[0.95rem] text-muted">{p.doctor_name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </PortalShell>
  );
}
