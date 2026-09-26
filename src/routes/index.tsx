import { createFileRoute, Link } from "@tanstack/react-router";

import founderPhoto from "@/assets/founder-velmurugan.jpg";
import { BrandStrip } from "@/components/BrandStrip";
import { SiteLayout } from "@/components/SiteLayout";
import { TvkHero } from "@/components/TvkHero";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NLCTVS Membership — Tamizhaga Vazhvurimai Katchi" },
      {
        name: "description",
        content:
          "Enroll as a party member in Tamil Nadu and instantly receive a verifiable digital membership card with a QR verification code.",
      },
      { property: "og:title", content: "NLCTVS Membership — Tamizhaga Vazhvurimai Katchi" },
      {
        property: "og:description",
        content:
          "Enroll as a party member in Tamil Nadu and instantly receive a verifiable digital membership card.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t } = useI18n();

  return (
    <SiteLayout>
      <TvkHero />

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl text-foreground">{t("home.steps.title")}</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[
            { n: "1", title: t("home.steps.one"), body: t("home.steps.oneBody") },
            { n: "2", title: t("home.steps.three"), body: t("home.steps.threeBody") },
          ].map((step) => (
            <article key={step.n} className="panel p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold font-display text-gold-foreground">
                {step.n}
              </span>
              <h3 className="mt-4 text-lg text-primary">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.3fr]">
          <div className="panel overflow-hidden">
            <BrandStrip />
            <div className="p-6 text-center">
              <img
                src={founderPhoto}
                alt={t("about.founderName")}
                className="mx-auto h-36 w-36 rounded-full border-4 border-gold object-cover"
              />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
                {t("about.founderTitle")}
              </p>
              <h3 className="mt-1 font-display text-xl text-primary">{t("about.founderName")}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("about.founderBody")}
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl text-foreground">{t("about.title")}</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("about.body")}</p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              {([
                ["about.facts.founded", "about.facts.foundedValue"],
                ["about.facts.ideology", "about.facts.ideologyValue"],
                ["about.facts.headquarters", "about.facts.headquartersValue"],
                ["about.facts.secretary", "about.facts.secretaryValue"],
              ] as [string, string][]).map(([labelKey, valueKey]: [string, string]) => (
                <div key={labelKey} className="panel p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t(labelKey)}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{t(valueKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
