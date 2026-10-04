# Hosting on GitHub Pages

This project is a TanStack Start (React 19) app that normally builds to a Nitro
server (for Lovable/Cloudflare). GitHub Pages can only serve static files, so
the build now has a second, fully static mode, plus a workflow that deploys it.

---

## 1. What was done

### Static build mode

| File | Change |
| --- | --- |
| `vite.config.ts` | New `GH_PAGES=1` mode: enables TanStack Start **SPA mode** (prerendered shell, hydrated on the client), skips **Nitro** entirely, and sets Vite `base` to `/<repo>/` (GitHub Pages serves project sites from `https://<owner>.github.io/<repo>/`). Adding `CUSTOM_DOMAIN=1` sets `base` to `/` instead — a custom domain serves the site from the root, so a `/<repo>/` prefix would 404 every asset and leave the page blank. The base also feeds TanStack's router `basepath`, so no manual basepath is needed. Default build (no `GH_PAGES`) is unchanged — Lovable's deploy keeps working. |
| `scripts/static-fallback.mjs` | New. SPA mode emits one `_shell.html`; this copies it to `index.html` (site root) and `404.html` (deep-link fallback, so `/verify/<token>` QR links boot the app instead of dying on a 404 page). Runs as `postbuild`; no-ops unless `GH_PAGES=1`. |
| `package.json` | Added `"postbuild": "node scripts/static-fallback.mjs"`. |
| `src/routes/__root.tsx` | Favicon link now uses `import.meta.env.BASE_URL` so it resolves under `/<repo>/`. |

### Deployment workflow

| File | Change |
| --- | --- |
| `.github/workflows/deploy-pages.yml` | New. On push to `main`/`Akash` (or manual `workflow_dispatch`): checkout → set up Bun → `bun install --frozen-lockfile` → `GH_PAGES=1 CUSTOM_DOMAIN=1 bun run build` → run `static-fallback` → verify `dist/client/index.html` + `404.html` exist → upload `dist/client` → deploy with `actions/deploy-pages@v4`. Permissions: `contents: read`, `pages: write`, `id-token: write`. Set the workflow's `CUSTOM_DOMAIN` env back to `"0"` to return to the `/<repo>/` project-site base. |

### Member photos (server route → Supabase Edge Function)

The photo endpoint `/api/public/photo/:token` was a server-only route, which a
static host cannot run. It was replaced for static builds by an Edge Function:

| File | Change |
| --- | --- |
| `supabase/functions/card-photo/index.ts` | New Edge Function. Accepts `?token=`, validates the token format, checks `member_cards` (not revoked) → `members` (active + has `photo_path`), issues a 300-second signed URL from the private bucket and streams it back. 404 on any invalid case, CORS `*`, `OPTIONS` → 204. Uses `SUPABASE_SERVICE_ROLE_KEY` from function secrets only. |
| `supabase/config.toml` | Added `[functions.card-photo] verify_jwt = false` — an `<img src>` cannot attach an `Authorization` header. |
| `src/services/membership.ts` | `memberPhotoUrl()` branches on `BASE_URL`: server build → `/api/public/photo/<token>`; static build → `https://<project-id>.supabase.co/functions/v1/card-photo?token=...` (built from the project id because `VITE_SUPABASE_URL` is a Lovable proxy that does not serve `/functions/v1`). |

### Documentation

- `README.md` §9 — running and deploying (server build vs. static build, Pages
  setup, Edge Function deploy commands).

### Verified

- `npx tsc --noEmit` passes.
- Clean default build → `.output/` server intact; client bundle uses
  `/api/public/photo/` and contains **no** Edge Function URL.
- Clean `GH_PAGES=1` build → `dist/client/` with `index.html`, `404.html`,
  `_shell.html`, all assets prefixed `/party-connect-nation/`.
- Local Pages simulator (base path + 404 fallback) + headless Chrome: `/`,
  `/enroll` and `/verify/<token>` all hydrate and render with no console errors.
- `/api/public/photo/:token` was the **only** server API route; nothing else
  breaks on a static host.

---

## 2. Publishing your first version

### Step 1 — Commit and push

```bash
git add .github scripts vite.config.ts package.json README.md \
        src/services/membership.ts src/routes/__root.tsx \
        src/routeTree.gen.ts supabase GITHUB_PAGES.md

git commit -m "Add GitHub Pages static build and deploy workflow"
git push -u origin Akash
```

Notes:

- **Never force-push or rewrite pushed history** — the repo is Lovable-connected
  and commits sync back to the editor.
- `package-lock.json` (untracked) is a stray npm artifact; the project uses Bun
  (`bun.lock` + `bunfig.toml`). Leave it out of the commit.

### Step 2 — Enable GitHub Pages (one-time)

1. Open the repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**
   (not "Deploy from a branch" — the workflow does the build and deploy).

### Step 3 — Trigger the deploy

Pushing in Step 1 triggers it automatically. To run it manually:
**Actions → "Deploy to GitHub Pages" → Run workflow**.

Wait for both the `build` and `deploy` jobs to turn green (first run ≈ 2–3 min).

### Step 4 — Custom domain (optional)

A custom domain added under **Settings → Pages → Custom domain** serves the
site from the **root** `/`, not `/<repo>/`. That is why the workflow builds
with `CUSTOM_DOMAIN: "1"` → Vite `base = "/"`:

- DNS (`A`/`CNAME` records) must point at GitHub Pages — DNS succeeding with a
  blank page means the build base was wrong, not the DNS.
- With a custom domain active, GitHub redirects the old
  `https://akash-anandhan.github.io/party-connect-nation/` URL to it, so the
  root base breaks nothing.
- Once DNS is verified, enable **Enforce HTTPS** in the same settings panel.
- QR codes embed `window.location.origin` at generation time — cards printed
  under the old `github.io` URL should be re-printed from the site on the
  custom domain.

### Step 5 — Get the site URL

**Settings → Pages** (or the `deploy` job's `page_url` output):

```
https://akash-anandhan.github.io/party-connect-nation/
```

If it 404s right after the first deploy, wait ~1 minute and hard-refresh
(`Ctrl+Shift+R`).

### Step 6 — Deploy the photo Edge Function

Member photos on the verification page need the Edge Function (not covered by
the Pages workflow):

```bash
npm i -g supabase                      # install the Supabase CLI
supabase login
supabase link --project-ref iczivwdmqndqxtjifbjm
supabase functions deploy card-photo --no-verify-jwt
```

**No secrets to set.** The platform injects `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` into every function by default — and names
starting with `SUPABASE_` are reserved, so `supabase secrets set` refuses
them on purpose (the Dashboard rejects them too).

- `--no-verify-jwt` is required (see above) and the endpoint still only returns
  a photo for a valid, unrevoked token.
- **Never** put the `service_role` key in `.env`, in docs, or in any file that
  could be committed — it bypasses RLS.

---

## 3. Good to know

- **No build secrets are needed.** All `VITE_*` values are already in the
  tracked `.env` and are public by design (publishable anon key). The static
  build inlines them into the client bundle.
- **QR codes use `window.location.origin`** — they are rendered client-side on
  `/verify/<token>` (via `/card`) and never stored, so a QR always encodes
  whatever domain it was viewed on. Previously printed QRs pointing at the old
  Lovable/`github.io` URL must be re-opened on the current domain and
  re-printed. GitHub 301-redirects `github.io` to a custom domain, so old QRs
  often still resolve — test one before bulk reprinting.
- **Re-deploys** run on every push to `main` or `Akash`; the normal
  Lovable/server build path is untouched.
- **Troubleshooting:** if the site loads but assets 404, the Pages source is
  probably set to "Deploy from a branch" — switch it to **GitHub Actions**. If
  photos 404, check `supabase functions list` shows `card-photo` and that
  `SUPABASE_SERVICE_ROLE_KEY` is set in function secrets.
