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
    async jwt({ token, user }) {
      // On fresh sign-in, user is provided
      if (user) {
        token.id = user.id;
        token.credits = user.credits ?? 10;
      }
      // If id is still missing (old session), find or create the user by email
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
};
