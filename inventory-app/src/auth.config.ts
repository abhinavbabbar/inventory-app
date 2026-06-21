import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no DB or Node-only modules.
// Used by middleware. The full config in src/auth.ts extends this with the
// Credentials provider (which needs Prisma + bcrypt and must run on Node).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const publicPaths = ["/login", "/forgot-password", "/reset-password"];
      const isPublic = publicPaths.some((p) => nextUrl.pathname.startsWith(p));

      if (isPublic) {
        // Already logged in? Bounce away from /login to dashboard.
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role;
        token.permissions = (user as { permissions?: string | null }).permissions ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as string | null;
      }
      return session;
    },
  },
  providers: [], // Real providers live in src/auth.ts
} satisfies NextAuthConfig;
