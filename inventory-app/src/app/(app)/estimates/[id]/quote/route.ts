import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCompanyInfo, getVatSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(session.user, "estimates", "view")) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const [estimate, company, vat] = await Promise.all([
    prisma.estimate.findUnique({
      where: { id },
      include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
    }),
    getCompanyInfo(),
    getVatSettings(),
  ]);
  if (!estimate) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderInvoicePdf({
    docType: "QUOTATION",
    company,
    vat: { label: vat.label, registrationNumber: vat.registrationNumber },
    sale: {
      invoiceNumber: estimate.estimateNumber,
      soldAt: estimate.issuedAt,
      placeOfSale: estimate.validUntil ? `Valid until ${estimate.validUntil.toLocaleDateString("en-GB")}` : null,
      vatRatePct: estimate.vatRatePct,
      vatAmountAed: estimate.vatAmountAed,
      notes: estimate.notes,
    },
    customer: {
      name: estimate.customer.name,
      mobile: estimate.customer.mobile,
      email: estimate.customer.email,
      deliveryAddress: estimate.customer.deliveryAddress,
    },
    lines: estimate.lines.map((l) => ({
      description: l.item.name,
      sku: l.item.sku,
      quantity: l.quantity,
      unitSalePriceAed: l.unitSalePriceAed,
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${estimate.estimateNumber}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
