import { NextResponse } from "next/server";

import { ingestCbuaeRate, peekStoredRate } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receives the daily Central Bank rate pushed by the scheduled GitHub Action.
// Secured by a shared bearer token (FX_INGEST_SECRET). The job runs from a
// GitHub-hosted IP that CBUAE doesn't block, so this is how the exact official
// rate reaches the app even though Vercel's own egress is firewalled by CBUAE.
//
//   POST /api/fx/ingest
//   Authorization: Bearer <FX_INGEST_SECRET>
//   { "inrToAed": 0.038929, "updatedLabel": "18 June 2026 06:05 PM" }
export async function POST(req: Request) {
  const secret = process.env.FX_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ingest not configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length === 0 || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const inrToAed = Number(obj.inrToAed);
  const updatedLabel = typeof obj.updatedLabel === "string" ? obj.updatedLabel : null;

  try {
    await ingestCbuaeRate({ inrToAed, updatedLabel });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    inrToAed,
    aedToInr: 1 / inrToAed,
    updatedLabel,
  });
}

// Read-only health check — returns the currently stored rate (no network call,
// no secret required). Handy to verify the job is landing values.
export async function GET() {
  const stored = await peekStoredRate();
  return NextResponse.json({ stored });
}
