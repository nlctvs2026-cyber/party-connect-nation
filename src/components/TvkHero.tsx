import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

import { BrandStrip } from "@/components/BrandStrip";
import { useI18n } from "@/i18n";

import ambedkar from "@/assets/hero/img/ambedkar.png";
import emblem from "@/assets/hero/img/emblem.png";
import flagbrush from "@/assets/hero/img/flagbrush.png";
import flagcorner from "@/assets/hero/img/flagcorner.png";
import leader from "@/assets/hero/img/leader.png";
import marx from "@/assets/hero/img/marx.png";
import periyar from "@/assets/hero/img/periyar.png";
import stroke from "@/assets/hero/img/stroke.png";
import valluvar from "@/assets/hero/img/valluvar.png";

/**
 * Client-designed hero section (source: hero-static/, embedded 2026-09-27).
 * Styling lives in src/styles/hero.css, scoped under `.tvk-hero`; the crowd
 * backdrop image is applied there as a CSS background. The original hero is
 * backed up in backup/hero/ — see backup/hero/README.md to restore it.
 */
export function TvkHero() {
  const { t } = useI18n();

  // The tagline is "A | B | C" in every language; rebuild it with the
  // client's styled separators.
  const taglineParts = t("home.hero.tagline").split("|");

  return (
    <section className="tvk-hero">
      {/* backdrop */}
      <div className="hero-backdrop" aria-hidden="true" />
      <div className="hero-wash" aria-hidden="true" />
      <img className="hero-flagcorner" src={flagcorner} alt="" aria-hidden="true" />

      {/* left column */}
      <div className="hero-main">
        <div className="hero-left">
          <ul className="hero-icons">
            <li>
              <img src={valluvar} alt={t("home.hero.iconValluvar")} />
            </li>
            <li>
              <img src={periyar} alt={t("home.hero.iconPeriyar")} />
            </li>
            <li>
              <img src={ambedkar} alt={t("home.hero.iconAmbedkar")} />
            </li>
            <li>
              <img src={marx} alt={t("home.hero.iconMarx")} />
            </li>
          </ul>

          <img className="hero-emblem" src={emblem} alt={t("app.fullName")} />

          <h1 className="hero-title">{t("app.fullName")}</h1>

          <p className="hero-tagline">
            {taglineParts.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && <span className="sep">|</span>}
                {part.trim()}
              </Fragment>
            ))}
          </p>

          <p className="hero-script">{t("home.hero.script")}</p>

          <img className="hero-stroke" src={stroke} alt="" aria-hidden="true" />

          {/* The static design linked to #join; here it goes to enrollment. */}
          <Link to="/enroll" className="hero-cta">
            {t("home.hero.cta")}
          </Link>
        </div>

        {/* right column */}
        <div className="hero-right">
          <img className="hero-flagbrush" src={flagbrush} alt="" aria-hidden="true" />
          <img className="hero-leader" src={leader} alt={t("home.hero.leaderAlt")} />
        </div>
      </div>

      {/* Tricolour divider between the hero and the next section — softens the
          hard background cut on phone screens. Hidden from lg up, where the
          two-column hero already blends into the page. `relative z-20` lifts it
          above the absolutely-positioned backdrop/wash layers, which would
          otherwise paint over this static in-flow element. */}
      <div className="relative z-20 no-print lg:hidden">
        <BrandStrip />
      </div>
    </section>
  );
}
