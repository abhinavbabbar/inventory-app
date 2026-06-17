import { handlers } from "@/auth";

// NextAuth credentials provider uses Node-only modules (bcrypt, Prisma).
export const runtime = "nodejs";

export const { GET, POST } = handlers;
