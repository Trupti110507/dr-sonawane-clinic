import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { setActiveLang, type Lang } from './i18n';

const KEY = 'clinic-language';

function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'mr' ? 'mr' : 'en';
  } catch {
    return 'en';
  }
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** The switch is offered to visitors and patients; staff pages are English only. */
  canSwitch: boolean;
}

const LangContext = createContext<LangState>({ lang: 'en', setLang: () => {}, canSwitch: true });

export function LangProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [chosen, setChosen] = useState<Lang>(stored);
  const staff = profile?.role === 'doctor' || profile?.role === 'admin';
  const lang: Lang = staff ? 'en' : chosen;
  setActiveLang(lang); // before the children draw themselves

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LangState>(
    () => ({
      lang,
      canSwitch: !staff,
      setLang: (next) => {
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // The choice simply is not remembered next time.
        }
        setChosen(next);
      },
    }),
    [lang, staff],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  return useContext(LangContext);
}
