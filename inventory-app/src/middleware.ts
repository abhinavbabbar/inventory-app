import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware uses only the Edge-safe config — no DB or bcrypt.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware(() => {
  // The `authorized` callback in authConfig handles redirect logic.
});

export const config = {
  // Run on every route except Next internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
