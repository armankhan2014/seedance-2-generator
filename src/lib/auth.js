import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider   from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider    from "next-auth/providers/apple";
import GitHubProvider   from "next-auth/providers/github";
import EmailProvider    from "next-auth/providers/email";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { sendSignupNotification, sendWelcomeEmail, sendMagicLinkEmail } from "./email";

// Referral-attribution cookie. Set by community.visualseffect.com's
// /api/referral/track on `?ref=<userId>` click. Cookie is scoped to
// `.visualseffect.com` so it's readable here on seedance as well. We
// honour it in createUser because the Prisma adapter creates the User
// row exactly once per email — and most referred users sign up here
// (paid product) before they ever touch community, so without this
// block referredById would stay null forever (which is what was
// happening — 1/71 captured pre-2026-05-25).
const REFERRAL_COOKIE = "tfc_ref";
const isProdEnv = process.env.NODE_ENV === "production";

// ── Providers — only add when env vars are present ─────────────────────────────
const providers = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    allowDangerousEmailAccountLinking: true,
    authorization: {
      params: { prompt: "select_account", access_type: "offline", response_type: "code" },
    },
  }),
];

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(FacebookProvider({
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    // Facebook does NOT always verify email ownership — auto-linking on
    // email lets an attacker who controls a Facebook profile claiming
    // someone else's email take over that account. Off by default here.
    allowDangerousEmailAccountLinking: false,
  }));
}

if (process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_KEY_ID) {
  providers.push(AppleProvider({
    clientId: process.env.APPLE_ID,
    clientSecret: {
      appleId: process.env.APPLE_ID,
      teamId: process.env.APPLE_TEAM_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
      keyId: process.env.APPLE_KEY_ID,
    },
    allowDangerousEmailAccountLinking: true,
  }));
}

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(GitHubProvider({
    clientId: process.env.GITHUB_ID,
    clientSecret: process.env.GITHUB_SECRET,
    allowDangerousEmailAccountLinking: true,
  }));
}

// Email magic link — works as long as GMAIL_USER + GMAIL_APP_PASS are set
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
  providers.push(EmailProvider({
    from: process.env.GMAIL_USER,
    // Custom send function — uses our branded Gmail email instead of NextAuth's default
    sendVerificationRequest: async ({ identifier: email, url }) => {
      await sendMagicLinkEmail({ email, url });
    },
  }));
}

// ── Auth config ────────────────────────────────────────────────────────────────
// NOTE: Using database sessions (not JWT) so the session cookie stays tiny
// (~150 bytes). Vercel rejects requests with headers > 16KB, and a bloated
// JWT cookie chunked across .0/.1/.2 fragments was tipping requests over
// that limit during OAuth signup. See KNOWN_ISSUES.md.
const isProd = process.env.NODE_ENV === "production";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  providers,
  pages: { signIn: "/", error: "/" },

  // Cross-subdomain SSO: cookie scoped to `.visualseffect.com` so the
  // same session is valid on community.visualseffect.com. Database
  // sessions mean existing logins keep working — the cookie domain
  // changes but the session record in Postgres is untouched.
  cookies: {
    sessionToken: {
      name: isProd
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: isProd ? ".visualseffect.com" : undefined,
      },
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      // Notify on every login (new and returning users)
      if (!isNewUser) {
        const { sendSignupNotification } = await import("@/lib/email");
        await sendSignupNotification({
          name: user.name,
          email: user.email,
          image: user.image,
          isReturning: true,
        }).catch(() => {});
      }
    },
    async createUser({ user }) {
      // ── Admin Signups Tracker: capture geo + source on the new User ────
      // Vercel's edge sets x-vercel-ip-* headers on every request before
      // the route handler runs. We read them via next/headers headers()
      // and patch the freshly-inserted User row. Best-effort: missing
      // headers (local dev, non-Vercel deploy) → fields stay NULL.
      try {
        const hdrs = await headers();
        const country = hdrs.get("x-vercel-ip-country") ?? null;
        const region  = hdrs.get("x-vercel-ip-country-region") ?? null;
        const cityRaw = hdrs.get("x-vercel-ip-city") ?? null;
        // Vercel URL-encodes city names with special chars (e.g.
        // "S%C3%A3o+Paulo" → "São Paulo"). Decode + trim.
        const city = cityRaw ? decodeURIComponent(cityRaw.replace(/\+/g, " ")) : null;
        const lat  = parseFloat(hdrs.get("x-vercel-ip-latitude") ?? "");
        const lng  = parseFloat(hdrs.get("x-vercel-ip-longitude") ?? "");
        // IP: Vercel forwards the real client IP via x-real-ip OR
        // x-forwarded-for (first hop is the real client when behind a
        // single trusted proxy, which Vercel is).
        const ip =
          hdrs.get("x-real-ip") ??
          (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() ?? null;
        // Signup source — minimal v1 detection from Referer + UTM in
        // the OAuth callback URL. Cookies the front-end may set later
        // (utm_source, etc.) would land here too. For now we trust the
        // referer and OAuth provider as the source.
        const referer = hdrs.get("referer") ?? "";
        let signupSource = "direct";
        if (referer.includes("instagram.com"))      signupSource = "instagram";
        else if (referer.includes("facebook.com"))  signupSource = "facebook";
        else if (referer.includes("twitter.com")
              || referer.includes("x.com"))         signupSource = "twitter";
        else if (referer.includes("tiktok.com"))    signupSource = "tiktok";
        else if (referer.includes("youtube.com"))   signupSource = "youtube";
        else if (referer.includes("visualseffect.com")) signupSource = "internal";
        // Update the freshly-created user with what we captured.
        await prisma.user.update({
          where: { id: user.id },
          data: {
            country,
            region,
            city,
            latitude:  Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            ipAddress: ip || null,
            signupSource,
          },
        });
      } catch (err) {
        // Never let geo capture block signup; admin dashboard tolerates NULLs.
        console.warn("[auth/geo-capture]", err?.message || err);
      }

      // Fire welcome + admin notification for every new sign-up (any provider)
      await Promise.allSettled([
        sendSignupNotification({ name: user.name, email: user.email, image: user.image }),
        sendWelcomeEmail({ name: user.name, email: user.email }),
        // Log the 10-credit signup grant to the ledger so SUM(delta)
        // == User.credits at all times. The NextAuth adapter sets the
        // initial 10 via schema default — without this log, every new
        // user starts with a +10 phantom delta in reconciliation.
        prisma.creditTransaction.create({
          data: { userId: user.id, delta: 10, reason: "signup_grant" },
        }).catch((e) => console.error("[SIGNUP_GRANT_LOG_FAILED]", e?.message)),
      ]);

      // ── Referral attribution ─────────────────────────────────────────────
      // Mirror of community.visualseffect.com's createUser referral block.
      // Most signups happen here (paid product), so this is where the
      // attribution actually fires for the vast majority of users. The
      // tfc_ref cookie was set by community's /api/referral/track route
      // when the visitor clicked a `?ref=<userId>` stamped share link;
      // it's scoped to .visualseffect.com so the browser includes it on
      // requests to seedance.visualseffect.com.
      //
      // Best-effort: never throw out of here, and never block signup
      // on a referral-side-effect failure.
      try {
        const jar = await cookies();
        const refId = jar.get(REFERRAL_COOKIE)?.value;
        if (!refId || refId === user.id) return;

        const referrer = await prisma.user.findUnique({
          where: { id: refId },
          select: { id: true, isDummy: true },
        });
        if (!referrer || referrer.isDummy) return;

        // Set referredById + auto-follow the referrer + notify them in
        // one transaction so partial failures don't leave half-applied
        // state. skipDuplicates on Follow in case the visitor somehow
        // already followed the referrer (e.g., reused account).
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { referredById: referrer.id },
          }),
          prisma.follow.createMany({
            data: [{ followerId: user.id, followingId: referrer.id }],
            skipDuplicates: true,
          }),
          prisma.notification.create({
            data: {
              userId: referrer.id,
              actorId: user.id,
              type: "referral_signup",
            },
          }),
        ]);

        // Clear the cookie — single-use attribution. Same flags as
        // when /api/referral/track set it so the browser actually
        // removes it (otherwise it would just be overwritten with
        // an empty value but stay alive).
        jar.set({
          name: REFERRAL_COOKIE,
          value: "",
          httpOnly: true,
          sameSite: "lax",
          secure: isProdEnv,
          path: "/",
          maxAge: 0,
          domain: isProdEnv ? ".visualseffect.com" : undefined,
        });
      } catch (err) {
        console.warn("[auth/referral]", err?.message || err);
      }
    },
  },

  callbacks: {
    // With database sessions, NextAuth passes the live DB user record here,
    // so we can read `credits` straight off it — no extra query needed.
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.credits = user.credits ?? 10;
        // Expose ID-verified state so the navbar avatar can render the
        // pink verified badge overlay (parity with community.visualseffect.com).
        session.user.verified = !!user.verified;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
