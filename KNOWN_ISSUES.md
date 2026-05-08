# Seedance Studio — Known Issues & Fixes

## Stack
- Next.js 16 (Turbopack), App Router
- NextAuth v4 with PrismaAdapter, JWT strategy
- Prisma v7.7 with `@prisma/adapter-pg` (Neon PostgreSQL)
- Stripe for payments, MuAPI for video generation
- Deployed on Vercel

---

## Issue 1: `OAuthAccountNotLinked` — User can't sign in with Google
**Symptom:** Redirects to Google, comes back to homepage with `?error=OAuthAccountNotLinked`
**Cause:** A User record exists in the DB with that email but has no linked Google Account row. Happens when a user is created directly via DB tools (fix-credits, JWT fallback, etc.) without going through Google OAuth.
**Fix applied:** Added `allowDangerousEmailAccountLinking: true` to GoogleProvider in `src/lib/auth.js`. This tells NextAuth to link Google to the existing email account instead of blocking.
**Emergency fix endpoint:** `GET /api/fix-login?secret=seedance2024fix99&email=USER_EMAIL` — clears broken OAuth records so user can re-authenticate fresh.

---

## Issue 2: Vercel builds failing in ~20-30 seconds
**Symptom:** All deployments show "Error" in Vercel, site stuck on old version.
**Cause:** Next.js 16 (Turbopack) requires any component using `useSearchParams()` to be wrapped in `<Suspense>`. Without it, static page generation crashes at build time.
**Affected files:** `src/components/saas/Navbar.jsx` and `src/app/pricing/page.js`
**Fix applied:**
- Wrapped `<Navbar />` in `<Suspense fallback={null}>` in `src/app/layout.js`
- Extracted pricing page into `PricingClient.jsx` ("use client") and made `page.js` a server wrapper with Suspense
**Rule:** Any new "use client" component that uses `useSearchParams()`, `usePathname()`, or similar navigation hooks must be wrapped in Suspense in its parent.

---

## Issue 3: Credits not added after Stripe purchase
**Symptom:** User buys credits, balance doesn't update.
**Cause:** Stripe webhook (`/api/stripe/webhook`) wasn't firing because `STRIPE_WEBHOOK_SECRET` env var wasn't set in Vercel. Credits are only added when the webhook fires.
**Fix applied:** Added `/api/stripe/verify-session` endpoint — called automatically when Stripe redirects back to `/pricing?success=true&session_id=...`. Verifies payment directly with Stripe API and adds credits without needing the webhook.
**Emergency fix endpoint:** `GET /api/fix-credits?secret=seedance2024&email=USER_EMAIL&credits=3000`

---

## Issue 4: MuAPI 404 errors
**Cause:** Webhook URL was passed as a query parameter (`?webhook=...`) which MuAPI doesn't support.
**Fix:** Pass webhook in the request body instead, or omit it entirely and use polling.

---

## Issue 5: Videos stuck in "MANIFESTING" / never showing in gallery
**Cause:** MuAPI uses `status: "completed"` and `outputs: ["url"]` format. Old polling code checked for `status: "succeeded"` and stopped retrying on any error.
**Fix:** Updated polling to check `outputs.length > 0`, retry up to 200 times, and never stop on network errors.

---

## Issue 6: Mobile download — `{"error":"URL not allowed"}` on iOS Safari
**Symptom:** User taps Download on a video; phone shows a JSON error page with `{"error":"URL not allowed"}`.
**Cause:** `/api/download` is a streaming proxy added so iOS Safari honours `Content-Disposition: attachment` (the `<a download>` attribute is ignored on iOS). It only allowed URLs starting with `R2_PUBLIC_URL`. But `src/lib/storage.js` falls back gracefully when R2 is unavailable, and older creations have URLs that point at MuAPI/CDN hosts directly — the proxy was rejecting all of them.
**Fix applied (commit `34186c3`):** `src/app/api/download/route.js` now also accepts any URL stored in the `Creation` table (`videoFiles` / `audioFiles` / `imageUrl`). Still tight: only URLs we ourselves saved are proxiable, so it's not an open bandwidth amplifier.

---

## Issue 7: `494 REQUEST_HEADER_TOO_LARGE` on Google OAuth signup
**Symptom:** Vercel-branded error page with `494: REQUEST_HEADER_TOO_LARGE` when the user clicks "Sign in with Google" or hits `/api/auth/callback/google`.
**Cause (recurring):** This codebase has a history of cookie-bloat incidents during auth migrations:
- **Round 1** (`9c71bc4`): JWT-strategy chunked the session into `__Secure-next-auth.session-token.0/.1/.2` (~3.5 KB each). Three chunks + Google OAuth-flow cookies > Vercel's 16 KB header limit. Migrated to database sessions to shrink active cookies.
- **Round 2** (`2d26647`): Added `domain=.visualseffect.com` for cross-subdomain SSO. Database sessions are tiny, but the **stale chunked cookies from round 1 stayed in users' browsers** — NextAuth doesn't garbage-collect cookies it no longer uses. Users who had logged in pre-`9c71bc4` were still sending the JWT chunks plus the new database session-token, blowing past 16 KB again.
- **Round 3 fix applied** (`34186c3`): Added `src/proxy.js` (Next.js 16's renamed `middleware.js` convention — see "Next.js 16 gotchas" below). On every page response it expires the stale chunk cookies on both host-only and `.visualseffect.com`-domain scopes. After one page hit the browser drops them; the next OAuth flow stays well under the limit.

**Important caveat — users currently locked out cannot be helped by app code.** Vercel rejects requests > 16 KB of headers at the edge before any function runs, so the proxy can't reach them. Tell affected users to clear cookies for `visualseffect.com` once (Chrome → Settings → Privacy → Site data → search "visualseffect" → Delete) or sign up in incognito. Going forward the proxy prevents recurrence.

**If this happens AGAIN:** check `git log -- src/proxy.js src/lib/auth.js` first — the cookie-migration history is the load-bearing context, not the latest commit alone.

---

## Next.js 16 gotchas
The project uses Next.js 16 (`AGENTS.md` warns: this is NOT the Next.js you know). Specifically:
- **`middleware.js` was renamed to `proxy.js`** — same file location (`src/proxy.js`), but the exported function is `proxy` (not `middleware`). Compiled output still shows up as `middleware.js` in stack traces; that's just the internal artifact name.
- Default runtime is **Node.js** (no longer Edge), so Prisma works directly inside `proxy.js`.
- Always read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before touching that file.
- Any "use client" component using `useSearchParams()` / `usePathname()` must be wrapped in `<Suspense>` (Issue 2 above).

---

## Useful Debug Endpoints (all require `?secret=seedance2024`)
| Endpoint | Use |
|---|---|
| `/api/check-credits?email=X` | Check actual DB credit balance |
| `/api/fix-credits?email=X&credits=3000` | Manually add credits |
| `/api/fix-login?secret=seedance2024fix99&email=X` | Clear broken OAuth records |
| `/api/debug-poll?id=MUAPI_ID` | Check raw MuAPI response for a prediction |

---

## Vercel Environment Variables Required
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXTAUTH_SECRET` — Random secret for JWT signing
- `NEXTAUTH_URL` — `https://seedance.visualseffect.com`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth app
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (**must be set!**)
- `MUAPI_KEY` — MuAPI API key
