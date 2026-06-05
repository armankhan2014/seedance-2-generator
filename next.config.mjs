/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,

  // Ship the welcome-email HTML template into the serverless bundle.
  // Without this Next.js's file-tracer skips it because the
  // fs.readFileSync path in src/lib/email.js is built at runtime
  // (path.join with process.cwd()) and can't be statically analyzed.
  // The /api/auth route triggers sendWelcomeEmail → trace from there.
  outputFileTracingIncludes: {
    "/api/auth/**/*": ["./emails/seedance_welcome_email.html"],
  },

  async redirects() {
    return [
      // Music moved to its own subdomain on 2026-05-22. Permanent
      // redirect (301) so old bookmarks, Google search hits, and any
      // /music/studio · /music/discover deep links land on the new
      // home. NOTE: only matches PAGE routes — /api/music/* is left
      // alone because in-flight MuAPI callbacks were registered against
      // this hostname and must still resolve here.
      //
      // Path mapping:
      //   /music           → https://music.visualseffect.com/
      //   /music/studio    → https://music.visualseffect.com/studio
      //   /music/discover  → https://music.visualseffect.com/discover
      //   /music/<rest>    → https://music.visualseffect.com/<rest>
      {
        source: "/music",
        destination: "https://music.visualseffect.com/",
        permanent: true,
      },
      {
        source: "/music/:path*",
        destination: "https://music.visualseffect.com/:path*",
        permanent: true,
      },
      // Track-share permalinks (/m/<cuid>) also moved with the split
      // — same redirect pattern. WhatsApp / Twitter / community-feed
      // links generated before 2026-05-22 still point at seedance and
      // need to find the track on the new home. The MusicTrack row
      // lives in the shared DB so the destination resolves cleanly.
      {
        source: "/m/:id",
        destination: "https://music.visualseffect.com/m/:id",
        permanent: true,
      },

      // ── Sign-in URL typo catch-alls (added 2026-06-05) ────────────
      // NextAuth's pages config sets signIn: "/" — there is no
      // /signin route at all; the homepage itself hosts the sign-in
      // surface (Google + Apple buttons). Users typing /signin,
      // /sigin (the actual keyboard misfire that caught a paying
      // user 2026-06-05), /login, etc. were hitting a real 404.
      //
      // 302 (temporary) so we can change destinations later without
      // browser cache sticking. The `?from=signin` query is a soft
      // hint the homepage can read to scroll to or surface the
      // auth buttons (not required — Sign In is in the navbar
      // regardless).
      {
        source: "/signin",
        destination: "/?from=signin",
        permanent: false,
      },
      {
        source: "/sigin",
        destination: "/?from=signin",
        permanent: false,
      },
      {
        source: "/sign-in",
        destination: "/?from=signin",
        permanent: false,
      },
      {
        source: "/login",
        destination: "/?from=signin",
        permanent: false,
      },
      {
        source: "/log-in",
        destination: "/?from=signin",
        permanent: false,
      },
      // Logout shortcut — clean URL many users type by habit.
      {
        source: "/logout",
        destination: "/api/auth/signout",
        permanent: false,
      },
      {
        source: "/sign-out",
        destination: "/api/auth/signout",
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Don't leak full URLs (with query strings) to third-party sites
          // when users click external links.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Block other sites from iframing this site (clickjacking defense).
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers from MIME-sniffing — prevents a JPG-as-JS attack
          // if anything ever slipped past upload validation.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Pin clients to HTTPS for 2 years incl. subdomains.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Drop unused browser features for everyone visiting the site.
          // microphone=(self) so the /music voice-recorder can use getUserMedia.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
