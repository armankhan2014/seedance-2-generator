import { NextResponse } from "next/server";

// Stale chunked JWT-session cookies left in users' browsers from the
// pre-`9c71bc4` JWT-session era. Each chunk is ~3.5 KB; with three of them
// plus Google's OAuth-flow cookies, total request headers tip past Vercel's
// 16 KB limit and the platform rejects the request with a 494 before it
// ever reaches our function — which is what users were hitting on Gmail
// signup. NextAuth doesn't garbage-collect cookies it no longer uses, so
// we expire them ourselves on every page response. After one visit to any
// page the browser drops them, and the next OAuth flow stays well under
// the limit.
//
// Both cookie name prefixes are listed because production sets the
// `__Secure-` prefix and dev does not. We don't know in advance which
// scope (host-only vs `.visualseffect.com`-domain) the original cookie
// was set under, so we expire on both — sending the wrong one is a no-op.
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

export function proxy(request) {
  const response = NextResponse.next();

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

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next internals — they don't carry the auth
    // cookies we care about, and running on every image would waste invocations.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm)$).*)",
  ],
};
