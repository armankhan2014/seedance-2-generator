import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { sendSignupNotification, sendWelcomeEmail } from "./email";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  pages: {
    signIn: "/",
    error: "/",
  },

  events: {
    /**
     * Fires once per brand-new user (not on repeat sign-ins).
     * Sends two emails in parallel:
     *   1. Admin notification  → armankhan0826@gmail.com
     *   2. Welcome email       → the new user
     * Both are fire-and-forget — failures are logged but never throw.
     */
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
        } catch (e) {
          console.error("JWT credits refresh failed:", e.message);
        }
        return token;
      }
      if (!token.id && token.email) {
        try {
          let dbUser = await prisma.user.findUnique({ where: { email: token.email } });
          if (!dbUser) {
            dbUser = await prisma.user.create({
              data: {
                email: token.email,
                name: token.name || null,
                image: token.picture || null,
              },
            });
          }
          token.id = dbUser.id;
          token.credits = dbUser.credits;
        } catch (e) {
          console.error("JWT user lookup failed:", e.message);
        }
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
