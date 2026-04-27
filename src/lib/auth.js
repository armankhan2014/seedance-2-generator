import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.credits = user.credits ?? 10;
      }
      // If id is missing, look up by email
      if (!token.id && token.email) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
          if (dbUser) {
            token.id = dbUser.id;
            token.credits = dbUser.credits;
          }
        } catch {}
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
};
