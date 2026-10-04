# NLCTVS — Tamizhaga Vazhvurimai Katchi Membership Portal

A bilingual (English / Tamil) party membership portal: instant public enrollment (the
digital card is issued immediately), HTML card templates, QR-based public verification,
and mobile-number card lookup.

**Live site:** https://www.nlctvs.us.ci/

Stack: React 19 + TypeScript + TanStack Start (file-based routing, SSR + server routes),
Tailwind CSS v4, and Lovable Cloud (Supabase: Postgres, Auth, Storage).

---

## 1. Pages

| Path | Access | Purpose |
| --- | --- | --- |
| `/` | public | Hero, enrollment CTA, party and founder information |
| `/enroll` | public | Enrollment form (state fixed to Tamil Nadu) |
| `/card` | public | Open a membership card by the mobile number it was enrolled with |
| `/verify/:token` | public | Card verification + rendered card (QR target) |
| `/api/public/photo/:token` | public | Streams a member photo via a short-lived signed URL |

The review/management console is not linked from anywhere in the public site.

---

## 2. Database structure

All tables live in `public`, use UUID primary keys, timestamps and RLS.

**`profiles`** — one row per authenticated user (`id` = auth user id, `email`, `full_name`).
Created automatically by the `handle_new_user` trigger.

**`user_roles`** — `(user_id, role)` unique; `role` is the enum `app_role` (`admin` | `member`).
Roles are never stored on `profiles`. Checked through the `SECURITY DEFINER` functions
`has_role(uuid, app_role)` and `is_admin()`.

**`members`** — every enrolled member (membership is instant; there is no application
step). `phone` is UNIQUE (10 digits) — one membership per mobile number, which is also
what makes duplicate submissions impossible. Plus `crf_no` (unique, generated), `full_name`,
`address`, `district`, `state` (always Tamil Nadu), `constituency`, `date_of_birth`
(DATE, CHECK 18+), `photo_path`, `is_active`, `joined_at`. Indexed on `phone`.

**`member_cards`** — one card per member. `member_id` (unique FK, cascade),
`public_token` (unique, cryptographically random 14 chars), `issued_at`, `revoked_at`.

**`card_templates`** — `name`, `html`, `is_active` (partial unique index enforces a single
active template), `created_by`.

### Database functions

| Function | Who can run it | What it does |
| --- | --- | --- |
| `has_role(uuid, app_role)` / `is_admin()` | authenticated | Role checks used inside RLS policies |
| `enroll_member(...)` | anon + authenticated | Instant enrollment: creates the member, CRF number and card token in one transaction; refuses duplicates via the unique phone constraint |
| `generate_public_token()` | internal | Random, non-sequential card token from `gen_random_bytes` |
| `verify_card(text)` | anon + authenticated | Public verification; returns only name, CRF, district, state, constituency, photo path, issue date and validity — never phone or address |
| `track_application(text)` | anon + authenticated | Public card lookup by mobile number; returns a minimal payload (name, CRF, district, constituency, joined date, card token) — never address |
| `phone_can_apply(text)` | anon + authenticated | True when the number is not a member yet; used by the enrollment form for an instant duplicate check |

CRF numbers are issued by the database (`CRF-<year>-<sequence>`). Users can never choose or
enter one.

---

## 3. Security model

- Authorization is enforced by Postgres **Row Level Security**, not by React routes.
- **Anonymous**: may enroll through the `enroll_member` function (the only way member rows
  are created) and upload a photo into `member-photos/applications/`; may read the active
  card template and call `verify_card` / `track_application`. Cannot read member rows
  directly.
- **Members**: may read their own `members` / `member_cards` rows (`user_id = auth.uid()`).
  Cannot read others' data or change roles.
- **Admins**: full management access through `is_admin()` policies.
- Photos live in a **private** storage bucket (`member-photos`, 5 MB limit). Only admins can
  read objects directly; the public card fetches the photo through
  `/api/public/photo/:token`, which resolves the token server-side and proxies a 5-minute
  signed URL.
- The service-role key is only used inside the server route, never in browser code.

---

## 4. Environment variables

The frontend uses only these (already configured in this project's `.env`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Server-side only (never exposed to the browser): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` — used exclusively by `/api/public/photo/:token`.

---

## 5. Card template variables

A template is an HTML fragment. Every `{{placeholder}}` is replaced client-side with the
member's data; unknown placeholders render as empty text, and all values are HTML-escaped.

| Placeholder | Value |
| --- | --- |
| `{{name}}` | Member full name |
| `{{crf_no}}` | Membership / CRF number |
| `{{phone}}` | Phone number (blank on public verification views) |
| `{{address}}` | Address (blank on public verification views) |
| `{{district}}` | District |
| `{{state}}` | State (always Tamil Nadu) |
| `{{constituency}}` | Constituency (thogudhi) |
| `{{photo}}` | Image URL for the member photo — use in `<img src="{{photo}}">` |
| `{{qr_code}}` | Data URL of the verification QR — use in `<img src="{{qr_code}}">` |

Cards are never stored as images: the active template plus live database data are rendered
in the browser each time, then printed or saved as PDF.

Admins upload templates from the card-templates manager (paste HTML or upload an `.html`
file), preview them with sample data, and set exactly one template active. A **Download
starter template** button hands an admin a commented base file that uses every placeholder,
and any saved template can be downloaded back as `.html` — both make it easy to develop new
card designs.

---

## 6. QR codes and verification

Each card embeds a QR pointing at `https://<your-domain>/verify/<public_token>`, e.g.
`/verify/qUBeBsNnUySbA`. The token is a cryptographically random, non-sequential 14-character
string — never the CRF number or a database UUID. The QR itself carries no personal data, and
the verification page shows only the minimum needed to confirm membership.

---

## 7. Admin setup

1. Create the administrator's account in the backend **Users** section (or let them sign up
   with email + password).
2. Grant the admin role:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'admin@example.com'
on conflict do nothing;
```

3. Sign in with that account. Accounts without the `admin` role are refused, both in the UI
   and by every RLS policy.

---

## 8. Multilingual support

All user-facing text lives in `src/i18n/language-en.json` and `src/i18n/language-ta.json`.
Components call `t("section.key")` from `src/i18n/index.tsx`; the switcher in the header
stores the choice in `localStorage`. Database content is stored language-independently.

---

## 9. Running and deploying

```bash
bun install                # or: npm install
bun run dev                # local development (http://localhost:5173)
bun run build              # production build -> server (Cloudflare) output
GH_PAGES=1 bun run build   # fully static build -> dist/client/ for GitHub Pages
```

### 9.1 Default build — server

This project is built on TanStack Start, which renders pages on the server and exposes the
`/api/public/photo/:token` endpoint. Publishing from Lovable deploys both the site and that
endpoint, with a custom domain available in project settings. `bun run build` writes a Nitro
worker to `.output/`.

### 9.2 Static build — GitHub Pages

GitHub Pages serves static files only and cannot run a server, so `GH_PAGES=1` reconfigures
the build:

| | `bun run build` | `GH_PAGES=1 bun run build` |
| --- | --- | --- |
| Nitro server | yes (`.output/`) | skipped |
| Mode | SSR | SPA, prerendered shell |
| Output | `.output/` | `dist/client/` |
| Base path | `/` | `/<repo>/` |
| Member photo | `/api/public/photo/:token` | `card-photo` Edge Function |

`postbuild` (`scripts/static-fallback.mjs`) republishes the shell as `index.html` and
`404.html`. GitHub Pages has no SPA rewrite rules, so any unknown path must be answered by
`404.html` for deep links like `/verify/<token>` to boot the router.

Deploy automatically with `.github/workflows/deploy-pages.yml`:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or `Akash`), or run the workflow manually.
3. The site lands at the custom domain: `https://www.nlctvs.us.ci/`
   (a custom domain serves from the root, so the workflow builds with
   `CUSTOM_DOMAIN: "1"` → Vite `base = "/"`). Without a custom domain it would be
   `https://<owner>.github.io/<repo>/`.

No build secrets are required: `.env` already carries the `VITE_*` values, which are public
by design (they ship in the browser bundle either way). Never add `SUPABASE_SERVICE_ROLE_KEY`
to `.env`.

### 9.3 Member photos on static hosting

`/api/public/photo/:token` cannot run on a static host, so the static build points
`memberPhotoUrl()` at the `card-photo` Supabase Edge Function instead — same token check, same
private bucket, same 5-minute signed URL. Deploy it once with the Supabase CLI:

```bash
supabase login
supabase functions deploy card-photo --no-verify-jwt
```

No secrets to set: the platform injects `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` into every function by default, and names
starting with `SUPABASE_` are reserved — `supabase secrets set` refuses them.

`verify_jwt` must stay off: the card loads the photo with `<img src>`, which cannot attach an
`Authorization` header. The endpoint still only returns a photo for a valid, unrevoked token.

---

## 10. Project structure

```
src/
  assets/            founder photo
  components/        shared UI (layout, brand strip, card renderer)
    admin/           admin-only panels
    ui/              shadcn primitives
  i18n/              language-en.json, language-ta.json, provider
  integrations/      generated backend client and types
  lib/               constants, card template engine, QR, formatting
  routes/            file-based routes (public pages, api)
  services/          database access: membership.ts (public), admin.ts (admin)
drizzle/migrations/  SQL schema, policies and functions
```
