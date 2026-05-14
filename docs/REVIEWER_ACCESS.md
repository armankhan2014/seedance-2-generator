# Play Store / App Store Reviewer Access

Google Play and App Store reviewers can't click magic-link emails sent to
a demo inbox, so we expose a one-URL sign-in for them.

## How it works

`GET /api/auth/reviewer?token=<REVIEWER_TOKEN>` validates the token,
mints a fresh NextAuth database session for a pre-seeded reviewer user,
sets the same session cookie NextAuth normally sets, and redirects to
`/`. The reviewer is then signed in for 30 days.

## One-time setup

```bash
# 1. Seed the reviewer user (idempotent — safe to re-run).
node scripts/seed-reviewer.mjs

# 2. Generate a long random token and add it to Vercel env vars
#    as REVIEWER_TOKEN (Production + Preview, NOT Development).
openssl rand -hex 32

# 3. Redeploy so the new env var takes effect.
```

## Paste into the store consoles

**Play Console → App content → App access → "All or some functionality is restricted":**

- Username:           `play-store-reviewer@visualseffect.com`
- Password:           *(leave blank — see instructions)*
- Instructions:
  > To sign in, open this URL in Chrome on Android:
  > https://seedance.visualseffect.com/api/auth/reviewer?token=YOUR_TOKEN
  >
  > You'll be redirected to the home page already signed in. The account
  > has 200 demo credits — enough to generate several test videos.

**App Store Connect → App Review Information → Sign-in required:** same URL.

## Security notes

- Token comparison is constant-time (resists timing attacks).
- Each hit mints a fresh sessionToken — replaying an old URL still works
  for 30 days until that particular session expires. Rotate the token to
  invalidate the URL.
- The reviewer account is a regular User row. To revoke access, either:
  - delete the user (cascade clears their sessions), or
  - change `REVIEWER_TOKEN` and redeploy.
- The endpoint refuses to work if `REVIEWER_TOKEN` is unset (returns 503).
