import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { getCompanyInfo, getVatSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

// Renders a sample receipt using the saved company/VAT branding, so the user
// can see how their logo, name, tagline and VAT line look without a real sale.
export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(session.user, "settings", "view")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [company, vat] = await Promise.all([getCompanyInfo(), getVatSettings()]);

  const lines = [
    { description: "Sample product A", sku: "SAMPLE-A", quantity: 2, unitSalePriceAed: new Prisma.Decimal("150.00") },
    { description: "Sample product B", sku: "SAMPLE-B", quantity: 1, unitSalePriceAed: new Prisma.Decimal("325.50") },
  ];
  const subtotal = lines.reduce(
    (acc, l) => acc.add(l.unitSalePriceAed.mul(l.quantity)),
    new Prisma.Decimal(0),
  );
  const rate = vat.enabled ? new Prisma.Decimal(vat.defaultRatePct || "0") : new Prisma.Decimal(0);
  const vatAmount = subtotal.mul(rate).div(100).toDecimalPlaces(2);

  const pdf = await renderInvoicePdf({
    company,
    vat: { label: vat.label, registrationNumber: vat.registrationNumber },
    sale: {
      invoiceNumber: "PREVIEW-0001",
      soldAt: new Date(),
      placeOfSale: "Store",
      vatRatePct: rate,
      vatAmountAed: vatAmount,
      notes: "This is a sample receipt for previewing your branding. No real sale is recorded.",
    },
    customer: {
      name: "Sample Customer",
      mobile: "+971 50 123 4567",
      email: "customer@example.com",
      deliveryAddress: "Dubai, United Arab Emirates",
    },
    lines,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="receipt-preview.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
