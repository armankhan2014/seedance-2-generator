import { NextResponse } from "next/server";

// ── Stale chunked cookies (round 1 — JWT-session era) ────────────────────
// Chunked JWT cookies left over from the pre-`9c71bc4` JWT-session era.
// Each chunk is ~3.5 KB; with three plus Google's OAuth-flow cookies the
// total request headers tip past Vercel's 16 KB limit and we get a 494
// before our function even runs. NextAuth doesn't garbage-collect cookies
// it no longer uses, so we expire them ourselves on every page response.
const STALE_CHUNK_NAMES = [
  "__Secure-next-auth.session-token.0",
  "__Secure-next-auth.session-token.1",
  "__Secure-next-auth.session-token.2",
  "__Secure-next-auth.session-token.3",
  "__Secure-next-auth.session-token.4",
  "next-auth.session-token.0",
  "next-auth.session-token.1",
  "next-auth.session-token.2",
];

// ── Stale host-only session cookies (round 4 — pre-`2d26647` era) ────────
// Before commit `2d26647` ("scope session cookie to .visualseffect.com")
// the active session cookie was written WITHOUT a Domain attribute —
// host-only on seedance.visualseffect.com. After that commit, NextAuth
// writes Domain=.visualseffect.com instead. Cookies are unique by
// (name, domain, path) per RFC 6265, so the new Domain-scoped Set-Cookie
// canNOT overwrite the old host-only cookie — they coexist in the
// browser's jar.
//
// What this means in practice: a user who signed in before the migration
// has BOTH cookies. The browser sends both in the Cookie header (same
// name, two values). NextAuth's cookie parser reads the FIRST value —
// often the stale host-only one — fails the Session lookup, and treats
// the user as not signed in. Even though the OAuth callback keeps writing
// fresh Session rows + Domain-scoped cookies, the stale host-only cookie
// sticks forever (NextAuth never expires it) and keeps blocking reads.
//
// Symptom: Arman reported 2026-05-17 that after logging into community
// he couldn't sign into Studio — clicking "Continue with Google"
// completed the OAuth roundtrip but he was still not signed in. The DB
// showed five fresh Session rows for his user (~46 seconds apart),
// proving OAuth was succeeding but the cookie read was failing.
//
// Fix: expire any host-only variant of the active session-token cookie
// on every page response. The Domain=.visualseffect.com variant is
// preserved (cookies with different Domain attributes are distinct
// jar entries, so expiring the host-only one doesn't touch it). After
// the user visits any page once, the stuck host-only cookie is gone
// and SSO + sign-in work normally.
const STALE_HOST_ONLY_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export function proxy(request) {
  const response = NextResponse.next();

  // Round 1: expire chunked JWT cookies on both scopes.
  for (const name of STALE_CHUNK_NAMES) {
    if (!request.cookies.has(name)) continue;
    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; SameSite=Lax`,
    );
    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; SameSite=Lax; Domain=.visualseffect.com`,
    );
  }

  // Round 4: expire HOST-ONLY variants of the active session cookie.
  // Critical: no `Domain=...` attribute here — we want to expire the
  // host-only cookie WITHOUT touching the Domain-scoped active one.
  for (const name of STALE_HOST_ONLY_NAMES) {
    if (!request.cookies.has(name)) continue;
    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`,
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next internals — they don't carry the auth
    // cookies we care about, and running on every image would waste invocations.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm)$).*)",
  ],
};
