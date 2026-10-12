import { Link } from 'react-router-dom';
import { telHref, type ClinicSettings } from '../lib/clinic';
import { tr } from '../lib/i18n';

interface Props {
  title: string;
  /** Which build stage delivers this screen, or null for "not found". */
  stage: string | null;
  settings: ClinicSettings;
}

export default function ComingSoon({ title, stage, settings }: Props) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="font-display text-4xl text-ink">{title}</h1>
      <p className="mt-3 text-muted">
        {stage
          ? `This screen is built in ${stage}. Until then, please call the clinic to book.`
          : tr('This page does not exist.', 'हे पान अस्तित्वात नाही.')}
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a
          href={telHref(settings.phone_primary)}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-sage-600 px-7 font-semibold text-white hover:bg-sage-700"
        >
          {tr(`Call ${settings.phone_primary}`, `${settings.phone_primary} वर कॉल करा`)}
        </a>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-sage-300 px-7 font-semibold text-sage-700 hover:bg-sage-50"
        >
          {tr('Back to home', 'मुख्यपृष्ठावर परत')}
        </Link>
      </div>
    </main>
  );
}
