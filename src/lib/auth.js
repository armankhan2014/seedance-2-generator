import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider   from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider    from "next-auth/providers/apple";
import GitHubProvider   from "next-auth/providers/github";
import EmailProvider    from "next-auth/providers/email";
import { prisma } from "./prisma";
import { sendSignupNotification, sendWelcomeEmail, sendMagicLinkEmail } from "./email";

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
