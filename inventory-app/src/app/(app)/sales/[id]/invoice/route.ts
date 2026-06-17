import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCompanyInfo, getVatSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!can(session.user, "sales", "view")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const [sale, company, vat] = await Promise.all([
    prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { item: true }, orderBy: { id: "asc" } },
      },
    }),
    getCompanyInfo(),
    getVatSettings(),
  ]);

  if (!sale) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderInvoicePdf({
    company,
    vat: { label: vat.label, registrationNumber: vat.registrationNumber },
    sale: {
      invoiceNumber: sale.invoiceNumber,
      soldAt: sale.soldAt,
      placeOfSale: sale.placeOfSale,
      vatRatePct: sale.vatRatePct,
      vatAmountAed: sale.vatAmountAed,
      notes: sale.notes,
    },
    customer: sale.customer
      ? {
          name: sale.customer.name,
          mobile: sale.customer.mobile,
          email: sale.customer.email,
          deliveryAddress: sale.customer.deliveryAddress,
        }
      : null,
    lines: sale.lines.map((l) => ({
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
      "Content-Disposition": `inline; filename="${sale.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
