# Hero backup — original homepage hero (pre client-redesign)

Backed up on 2026-09-27 when the client's new hero design (from `hero-static/`)
replaced the original hero on the homepage.

## Contents

- `HeroClassic.tsx` — the original hero section as a self-contained React
  component (exact markup that lived in `src/routes/index.tsx`).

## How to restore the old hero

1. Copy `HeroClassic.tsx` into `src/components/`.
2. In `src/routes/index.tsx`:
   - replace `import { TvkHero } from "@/components/TvkHero";` with
     `import { HeroClassic } from "@/components/HeroClassic";`
   - replace `<TvkHero />` with `<HeroClassic />`.
3. The new-hero assets stay in `src/assets/hero/` and `src/styles/hero.css` —
   they are only referenced by `TvkHero`, so leaving them costs nothing. Delete
   them later if you want.
4. i18n keys used by the old hero (`home.eyebrow`, `home.title`,
   `home.subtitle`, `home.cta`, `home.secondaryCta`, `app.party`,
   `app.fullName`, `app.state`) still exist in both language files.

## New-hero files (for reference, live under src/)

- `src/components/TvkHero.tsx` — the new hero component.
- `src/styles/hero.css` — client CSS, scoped under `.tvk-hero`, imported once
  from `src/styles.css`.
- `src/assets/hero/img/` — crowd backdrop, emblem, leader portrait, icon
  portraits, decorations.
- `src/assets/hero/fonts/` — local woff2 fonts (Anek Tamil, Catamaran,
  Noto Sans Tamil) + `fonts.css`.
