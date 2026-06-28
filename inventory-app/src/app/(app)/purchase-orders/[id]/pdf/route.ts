import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCompanyInfo } from "@/lib/settings";
import { renderPoPdf } from "@/lib/po-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(session.user, "purchaseOrders", "view")) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const [po, company] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
    }),
    getCompanyInfo(),
  ]);
  if (!po) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderPoPdf({
    company,
    po: { poNumber: po.poNumber, orderedAt: po.orderedAt, expectedAt: po.expectedAt, notes: po.notes },
    supplier: { name: po.supplier.name, phone: po.supplier.phone, email: po.supplier.email, address: po.supplier.address },
    lines: po.lines.map((l) => ({ description: l.item.name, sku: l.item.sku, quantity: l.quantity, unitPurchasePriceInr: l.unitPurchasePriceInr })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${po.poNumber}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
