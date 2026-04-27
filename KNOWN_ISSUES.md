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
