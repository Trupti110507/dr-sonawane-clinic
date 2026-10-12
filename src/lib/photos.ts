import { supabase } from './supabase';
import { tr } from './i18n';

/** The private storage folder. Nothing in it has a public link. */
export const PHOTO_BUCKET = 'patient-photos';
/** How long a link to a picture works, in seconds */
const LINK_SECONDS = 300;

/**
 * The wording the patient agrees to. The exact text is saved with each consent,
 * so a later change here never alters what an earlier patient agreed to.
 * Ask the clinic's doctors to review this wording before real use.
 */
export const CONSENT_WORDING =
  'I agree that the doctor treating me at this clinic may take photographs of the affected skin, hair or nails ' +
  'and keep them in my medical record, to follow the progress of my treatment. Only the doctors treating me can ' +
  'see them. They will not be used for teaching, advertising or social media. I can withdraw this consent at any ' +
  'time: no new photographs will be taken after that, and I can ask the clinic to delete the existing ones.';

/** The same agreement in Marathi. A patient who agrees in Marathi has this exact text saved with their consent. */
export const CONSENT_WORDING_MR =
  'या क्लिनिकमध्ये माझ्यावर उपचार करणारे डॉक्टर माझ्या उपचाराची प्रगती पाहण्यासाठी माझ्या बाधित त्वचा, केस किंवा नखांचे ' +
  'फोटो काढून ते माझ्या वैद्यकीय नोंदीत ठेवू शकतात, याला मी संमती देतो/देते. हे फोटो फक्त माझ्यावर उपचार करणारे डॉक्टरच ' +
  'पाहू शकतात. ते शिकवण्यासाठी, जाहिरातीसाठी किंवा सोशल मीडियावर वापरले जाणार नाहीत. मी ही संमती कधीही मागे घेऊ ' +
  'शकतो/शकते: त्यानंतर नवीन फोटो काढले जाणार नाहीत, आणि आधीचे फोटो हटवण्याची विनंती मी क्लिनिकला करू शकतो/शकते.';

/** The agreement in the language the patient is reading. */
export function consentWording(): string {
  return tr(CONSENT_WORDING, CONSENT_WORDING_MR);
}

export interface PhotoConsent {
  given_at: string;
  method: 'patient_portal' | 'at_clinic';
  recorded_by_name: string | null;
}

export interface PatientPhoto {
  id: string;
  storage_path: string;
  body_area: string;
  taken_on: string;
  doctor_name: string;
  note?: string | null;
  shared_with_patient?: boolean;
}

export interface PhotoSet {
  consent: PhotoConsent | null;
  photos: PatientPhoto[];
}

/**
 * Redraws a chosen picture as a JPEG no larger than 1800 pixels on its long side.
 * This keeps uploads small on a phone connection, and it leaves behind the hidden
 * details a phone camera saves inside the file, such as the GPS location.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('UNREADABLE'));
      img.src = URL.createObjectURL(file);
    });
  }
  const scale = Math.min(1, 1800 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('UNREADABLE'))), 'image/jpeg', 0.85),
  );
}

/** Short-lived links for a list of stored pictures: path -> link. Links stop working after five minutes. */
export async function signedLinks(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || paths.length === 0) return {};
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, LINK_SECONDS);
  const links: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) links[row.path] = row.signedUrl;
  return links;
}

/** Opens one picture at full size in a new tab, with a fresh link. */
export async function openPhoto(path: string) {
  // Open the tab straight away (browsers block tabs opened later), then point it at the picture.
  const tab = window.open('', '_blank');
  const link = (await signedLinks([path]))[path];
  if (tab && link) tab.location.href = link;
  else tab?.close();
}

/** Photos grouped by body area, each group in date order, so progress reads left to right. */
export function byArea<T extends PatientPhoto>(photos: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const p of photos) {
    const key = [...groups.keys()].find((k) => k.toLowerCase() === p.body_area.toLowerCase()) ?? p.body_area;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()];
}
