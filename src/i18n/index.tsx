import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import en from "./language-en.json";
import ta from "./language-ta.json";

export type Language = "en" | "ta";

const DICTIONARIES: Record<Language, unknown> = { en, ta };
const STORAGE_KEY = "party.lang";

/**
 * Tamil is the site default on every fresh visit. A language picked with the
 * switcher lasts for the browsing session (per tab) only, so the first paint
 * already has the right language — no default-then-flip flash.
 */
function initialLanguage(): Language {
  if (typeof window === "undefined") return "ta";
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ta") return stored;
  } catch {
    // Storage unavailable (e.g. private mode) — fall back to the default.
  }
  return "ta";
}

function lookup(dict: unknown, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

interface I18nValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage failures — the in-memory choice still applies.
    }
  }, []);

  const t = useCallback(
    (key: string) => lookup(DICTIONARIES[language], key) ?? lookup(DICTIONARIES.en, key) ?? key,
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // No provider in scope — e.g. a component rendered during an HMR swap after
  // this module was re-evaluated, or an isolated preview. Fall back to the
  // default language instead of crashing the tree; the next full render gets
  // the provider again.
  return {
    language: "ta",
    setLanguage: () => {},
    t: (key: string) => lookup(DICTIONARIES.ta, key) ?? lookup(DICTIONARIES.en, key) ?? key,
  };
}
