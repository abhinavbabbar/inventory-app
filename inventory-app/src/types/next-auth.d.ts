import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    permissions?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    permissions?: string | null;
  }
}
