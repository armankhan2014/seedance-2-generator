import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const SSO_SECRET = process.env.WP_SSO_SECRET || "ve-seedance-sso-2024";

async function verifyWpToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SSO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(h+"."+p));
    if (!valid) return null;
    const payload = JSON.parse(atob(p));
    if (payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      id: "wordpress-sso",
      name: "WordPress",
      credentials: { token: { type: "text" } },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const payload = await verifyWpToken(credentials.token);
        if (!payload) return null;
        const user = await prisma.user.upsert({
          where: { email: payload.email },
          update: { name: payload.name },
          create: { id: "wp_"+payload.wp_user_id, email: payload.email, name: payload.name, credits: 0 }
        });
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      return session;
    }
  },
  pages: { signIn: "/api/auth/signin" },
  secret: process.env.NEXTAUTH_SECRET
});

export { handler as GET, handler as POST };
