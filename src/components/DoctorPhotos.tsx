import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { dayOf } from '../lib/appointments';
import { friendlyError } from '../lib/auth';
import { formatDate } from '../lib/clinic';
import { CONSENT_WORDING, PHOTO_BUCKET, byArea, openPhoto, prepareImage, signedLinks, type PhotoSet } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { btnDanger, btnOutline, btnPrimary, btnSmall, card, inputBox } from '../lib/ui';
import Field, { Notice } from './Field';

interface Props {
  patientId: string;
  patientName: string;
  today: string;
  timezone: string;
}

/** Progress photos inside the patient record: consent first, then upload, share and compare. */
export default function DoctorPhotos({ patientId, patientName, today, timezone }: Props) {
  const [set, setSet] = useState<PhotoSet | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const agreeId = useId();

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: failed } = await supabase.rpc('patient_photos_for', { p_patient_id: patientId });
    if (failed) return setError(friendlyError(failed));
    const loaded = (data as PhotoSet | null) ?? { consent: null, photos: [] };
    setSet(loaded);
    setLinks(await signedLinks(loaded.photos.map((p) => p.storage_path)));
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: string, args: Record<string, unknown>, done: string): Promise<unknown> {
    if (!supabase) return null;
    setBusy(true);
    setError('');
    setNotice('');
    const { data, error: failed } = await supabase.rpc(fn, args);
    setBusy(false);
    if (failed) {
      setError(friendlyError(failed));
      return null;
    }
    setNotice(done);
    setRemoving(null);
    setWithdrawing(false);
    setAgreed(false);
    await load();
    return data ?? true;
  }

  async function remove(id: string) {
    // The record goes first; only then does the database allow the file itself to be removed.
    const path = await run('delete_patient_photo', { p_id: id }, 'Photo deleted.');
    if (typeof path === 'string') await supabase!.storage.from(PHOTO_BUCKET).remove([path]);
  }

  const consent = set?.consent ?? null;

  return (
    <section className="mt-10 max-w-3xl" aria-labelledby="photos-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="photos-title" className="font-display text-2xl">
          Progress photos
        </h2>
        {consent && !adding && (
          <button className={btnPrimary} onClick={() => { setError(''); setNotice(''); setAdding(true); }}>
            Add photo
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && !error && (
        <div className="mt-4">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}

      {set === null ? (
        !error && <p role="status" className="mt-4 text-muted">Loading photos…</p>
      ) : (
        <>
          {consent ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted">
                Consent given on {formatDate(dayOf(consent.given_at, timezone))},{' '}
                {consent.method === 'patient_portal' ? 'by the patient in their portal' : `recorded at the clinic by ${consent.recorded_by_name ?? 'a doctor'}`}.
              </p>
              {!withdrawing && (
                <button className={btnSmall} onClick={() => setWithdrawing(true)}>
                  Withdraw consent
                </button>
              )}
            </div>
          ) : (
            <form
              noValidate
              className={`${card} mt-4 space-y-4 border-lavender-400`}
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!agreed) return setError('Tick the box to confirm that the patient has agreed.');
                void run('record_photo_consent', { p_patient_id: patientId, p_confirm: true, p_wording: CONSENT_WORDING }, 'Consent recorded. You can now add photos.');
              }}
            >
              <h3 className="text-[1.05rem] font-bold text-ink">Consent is needed before any photo</h3>
              <p className="text-ink">
                {patientName} can agree in their own portal, under Photos. Or read this wording to them now and record their answer:
              </p>
              <blockquote className="rounded-xl bg-sage-50 p-4 text-ink">{CONSENT_WORDING}</blockquote>
              <div className="flex items-start gap-3">
                <input id={agreeId} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={agreed} onChange={(e) => { setError(''); setAgreed(e.target.checked); }} />
                <label htmlFor={agreeId} className="text-ink">
                  The patient has heard or read this wording and has agreed.
                </label>
              </div>
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? 'Recording…' : 'Record consent'}
              </button>
            </form>
          )}

          {withdrawing && (
            <div className={`${card} mt-3 border-[#e3b9b6]`}>
              <p className="text-ink">
                Withdraw only at the patient's request. No new photos can be added afterwards. Existing photos stay in the record until you delete them.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button disabled={busy} className={btnDanger} onClick={() => void run('withdraw_photo_consent', { p_patient_id: patientId }, 'Consent withdrawn. No new photos can be added.')}>
                  Withdraw consent
                </button>
                <button className={btnSmall} onClick={() => setWithdrawing(false)}>
                  Keep consent
                </button>
              </div>
            </div>
          )}

          {adding && consent && (
            <PhotoForm
              patientId={patientId}
              today={today}
              onClose={(saved) => {
                setAdding(false);
                if (saved) {
                  setNotice(saved);
                  void load();
                }
              }}
            />
          )}

          {set.photos.length === 0 ? (
            consent && !adding && <p className="mt-4 text-muted">No photos yet.</p>
          ) : (
            byArea(set.photos).map(([area, photos]) => (
              <div key={area} className="mt-6">
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
                        {p.note && <p className="mt-1 text-ink">{p.note}</p>}
                        <p className={`mt-2 inline-block rounded-full px-3 py-1 text-[0.95rem] font-semibold ${p.shared_with_patient ? 'bg-sage-100 text-sage-900' : 'bg-lavender-200 text-lavender-700'}`}>
                          {p.shared_with_patient ? 'Shared with the patient' : 'Not visible to the patient'}
                        </p>
                        {removing === p.id ? (
                          <div className="mt-3">
                            <p className="text-ink">Delete this photo for good? It cannot be brought back.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button disabled={busy} className={btnDanger} onClick={() => void remove(p.id)}>
                                Yes, delete
                              </button>
                              <button className={btnSmall} onClick={() => setRemoving(null)}>
                                Keep it
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              disabled={busy}
                              className={btnSmall}
                              onClick={() =>
                                void run('set_photo_shared', { p_id: p.id, p_share: !p.shared_with_patient }, p.shared_with_patient ? 'The patient can no longer see that photo.' : 'The patient can now see that photo.')
                              }
                            >
                              {p.shared_with_patient ? 'Stop sharing' : 'Share with patient'}
                            </button>
                            <button className={btnSmall} onClick={() => setRemoving(p.id)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}

/** Choose a picture, say what it shows, upload it. */
function PhotoForm({ patientId, today, onClose }: { patientId: string; today: string; onClose: (saved?: string) => void }) {
  const fileId = useId();
  const dateId = useId();
  const shareId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [area, setArea] = useState('');
  const [takenOn, setTakenOn] = useState(today);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<{ file?: string; area?: string; date?: string }>({});

  async function choose(file: File | undefined) {
    setProblems({});
    setError('');
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    if (!file) return;
    try {
      const blob = await prepareImage(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setProblems({ file: 'That file could not be read as a picture. Choose a JPG or PNG photo.' });
      if (input.current) input.current.value = '';
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const found: typeof problems = {};
    if (!preview) found.file = 'Choose a photo first.';
    if (area.trim().length < 2) found.area = 'Say which part of the body the photo shows, for example Left cheek.';
    if (!takenOn || takenOn > today) found.date = 'The date taken cannot be in the future.';
    setProblems(found);
    if (Object.keys(found).length || !preview || !supabase) return;

    setBusy(true);
    const path = `${patientId}/${crypto.randomUUID()}.jpg`;
    const store = supabase.storage.from(PHOTO_BUCKET);
    const { error: uploadFailed } = await store.upload(path, preview.blob, { contentType: 'image/jpeg' });
    if (uploadFailed) {
      setBusy(false);
      return setError('The photo could not be uploaded. Check that consent is recorded and the connection is working, then try again.');
    }
    const { error: failed } = await supabase.rpc('add_patient_photo', {
      p_patient_id: patientId,
      p_path: path,
      p_body_area: area,
      p_taken_on: takenOn,
      p_note: note,
      p_share: share,
    });
    if (failed) {
      // Do not leave a picture in storage with no record of it.
      await store.remove([path]);
      setBusy(false);
      return setError(friendlyError(failed));
    }
    setBusy(false);
    URL.revokeObjectURL(preview.url);
    onClose(share ? 'Photo added and shared with the patient.' : 'Photo added. The patient cannot see it unless you share it.');
  }

  return (
    <form onSubmit={save} noValidate className={`${card} mt-4 space-y-5 border-sage-300`}>
      <h3 className="font-display text-2xl">Add photo</h3>
      <div>
        <label htmlFor={fileId} className="block font-semibold text-ink">
          Photo
        </label>
        <p className="text-[0.95rem] text-muted">On a phone you can take the picture now. Avoid including the face unless it is the area being treated.</p>
        <input
          ref={input}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={problems.file ? true : undefined}
          className="mt-2 block w-full text-ink file:mr-4 file:min-h-11 file:rounded-full file:border file:border-solid file:border-sage-300 file:bg-white file:px-5 file:font-semibold file:text-sage-700"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        {problems.file && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{problems.file}</p>}
        {preview && <img src={preview.url} alt="The photo you chose" className="mt-3 max-h-64 rounded-xl border border-line" />}
      </div>
      <Field label="Body area" hint="Use the same words each time, so photos of one area line up for comparison" value={area} maxLength={60} error={problems.area} onChange={(e) => setArea(e.target.value)} />
      <div className="max-w-xs">
        <label htmlFor={dateId} className="block font-semibold text-ink">
          Date taken
        </label>
        <input id={dateId} type="date" className={inputBox} max={today} value={takenOn} aria-invalid={problems.date ? true : undefined} onChange={(e) => setTakenOn(e.target.value)} />
        {problems.date && <p className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">{problems.date}</p>}
      </div>
      <Field label="Note" hint="Optional. For doctors only; the patient does not see it." value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <div className="flex items-start gap-3">
        <input id={shareId} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={share} onChange={(e) => setShare(e.target.checked)} />
        <label htmlFor={shareId} className="text-ink">
          Show this photo to the patient in their portal
        </label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Uploading…' : 'Upload photo'}
        </button>
        <button type="button" className={btnOutline} onClick={() => onClose()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
