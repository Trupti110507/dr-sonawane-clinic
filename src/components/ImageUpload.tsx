import { useId, useState } from 'react';
import { ASSET_BUCKET } from '../lib/clinic';
import { friendlyError } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { FieldError } from './Field';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;

interface Props {
  label: string;
  hint: string;
  /** Start of the stored file name, e.g. "logo" or "doctor" */
  prefix: string;
  /** Picture to show now, or null */
  currentUrl: string | null;
  /** Round preview (people) or square (logo) */
  round?: boolean;
  /** Called with the stored file path once the upload has finished */
  onUploaded: (path: string) => void;
}

/** Picks an image, checks it, and uploads it to the clinic's public image folder. */
export default function ImageUpload({ label, hint, prefix, currentUrl, round, onUploaded }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(file: File | undefined) {
    setError('');
    if (!file || !supabase) return;
    const ext = TYPES[file.type];
    if (!ext) return setError('Choose a PNG, JPG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That image is larger than 2 MB. Choose a smaller one.');
    setBusy(true);
    // A new name each time, so browsers never show an old copy.
    const path = `${prefix}-${Date.now()}.${ext}`;
    const { error: failed } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: file.type });
    setBusy(false);
    if (failed) setError(friendlyError(failed));
    else onUploaded(path);
  }

  return (
    <div>
      <p className="font-semibold text-ink">{label}</p>
      <p className="text-[0.95rem] text-muted">{hint}</p>
      <div className="mt-3 flex items-center gap-4">
        <span
          className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-line bg-sage-50 ${
            round ? 'rounded-full' : 'rounded-2xl'
          }`}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="" className={`h-full w-full ${round ? 'object-cover' : 'object-contain p-2'}`} />
          ) : (
            <span className="text-sm text-muted">None</span>
          )}
        </span>
        <label
          htmlFor={id}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-sage-300 bg-white px-5 text-[0.95rem] font-semibold text-sage-700 hover:bg-sage-50 focus-within:outline focus-within:outline-3 focus-within:outline-lavender-400"
        >
          {busy ? 'Uploading…' : currentUrl ? 'Replace image' : 'Choose image'}
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
