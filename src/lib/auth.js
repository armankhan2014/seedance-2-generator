import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { sendSignupNotification } from "./email";

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

  // ─── Notify Arman whenever a brand-new user signs up ───────────────────────
  events: {
    async createUser({ user }) {
      try {
        await sendSignupNotification({
          name: user.name,
          email: user.email,
          image: user.image,
        });
      } catch (err) {
        console.error("[AUTH_EVENT] createUser notification failed:", err.message);
      }
    },
  },
  // ───────────────────────────────────────────────────────────────────────────

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
          if (dbUser) {
            token.credits = dbUser.credits;
          }
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
