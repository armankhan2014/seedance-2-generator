/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,

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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
