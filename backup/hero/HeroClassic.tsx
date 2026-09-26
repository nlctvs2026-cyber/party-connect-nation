/**
 * BACKUP — Original homepage hero section (pre client-redesign).
 *
 * This is the hero that shipped through commit e14f8d2 ("valiadtion bug fixes").
 * It is kept here so it can be swapped back in whenever the client asks for the
 * old design again. Do not import it into the app — this file is reference
 * material only.
 *
 * To restore: replace <TvkHero /> in src/routes/index.tsx with <HeroClassic />
 * (copy this file to src/components/HeroClassic.tsx) and remove the TvkHero
 * import. The i18n keys used here (home.eyebrow/title/subtitle/cta/secondaryCta,
 * app.party/fullName/state) still exist in both language files.
 */
import { Link } from "@tanstack/react-router";

import partyFlag from "@/assets/favicon.jpeg";
import { BrandStrip } from "@/components/BrandStrip";
import { useI18n } from "@/i18n";

export function HeroClassic() {
  const { t } = useI18n();

  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:items-center md:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            {t("home.eyebrow")}
          </p>
          <h1 className="mt-4 text-4xl leading-tight text-primary md:text-5xl">
            {t("home.title")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {t("home.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/enroll"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition-opacity hover:opacity-90"
            >
              {t("home.cta")}
            </Link>
            <Link
              to="/card"
              className="rounded-md border border-primary px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted"
            >
              {t("home.secondaryCta")}
            </Link>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <BrandStrip />
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <img
              src={partyFlag}
              alt={t("app.party")}
              className="h-24 w-24 rounded-full border-4 border-gold object-cover"
            />
            <p className="font-display text-2xl text-primary">{t("app.party")}</p>
            <p className="text-sm font-medium text-foreground">{t("app.fullName")}</p>
            <p className="text-sm text-muted-foreground">{t("app.state")}</p>
          </div>
          <BrandStrip />
        </div>
      </div>
    </section>
  );
}
