import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider from "next-auth/providers/apple";
import GitHubProvider from "next-auth/providers/github";
import { prisma } from "./prisma";
import { sendSignupNotification, sendWelcomeEmail } from "./email";

// Build provider list — only add a provider when its env vars are present
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
    allowDangerousEmailAccountLinking: true,
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

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/", error: "/" },

  events: {
    async createUser({ user }) {
      await Promise.allSettled([
        sendSignupNotification({ name: user.name, email: user.email, image: user.image }),
        sendWelcomeEmail({ name: user.name, email: user.email }),
      ]);
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.credits = user.credits ?? 10;
        return token;
      }
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
          if (dbUser) token.credits = dbUser.credits;
        } catch (e) { console.error("JWT credits refresh failed:", e.message); }
        return token;
      }
      if (!token.id && token.email) {
        try {
          let dbUser = await prisma.user.findUnique({ where: { email: token.email } });
          if (!dbUser) {
            dbUser = await prisma.user.create({
              data: { email: token.email, name: token.name || null, image: token.picture || null },
            });
          }
          token.id = dbUser.id;
          token.credits = dbUser.credits;
        } catch (e) { console.error("JWT user lookup failed:", e.message); }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.credits = token.credits ?? 10;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
