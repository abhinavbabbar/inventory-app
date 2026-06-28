"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCompanyInfo, getVatSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import type { EmailState } from "@/components/share-actions";

export async function emailInvoice(
  saleId: string,
  _prev: EmailState,
  _formData: FormData,
): Promise<EmailState> {
  const session = await auth();
  if (!session?.user || !can(session.user, "sales", "view")) return { error: "Forbidden" };

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!sale) return { error: "Sale not found" };
  if (!sale.customer?.email) return { error: "This customer has no email address on file." };
  if (!isEmailConfigured()) return { error: "Email isn't set up yet (add RESEND_API_KEY)." };

  const [company, vat] = await Promise.all([getCompanyInfo(), getVatSettings()]);
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

  const brand = company.name || "BookWise";
  const result = await sendEmail({
    to: sale.customer.email,
    subject: `Invoice ${sale.invoiceNumber} from ${brand}`,
    text: `Hi ${sale.customer.name},\n\nPlease find your invoice ${sale.invoiceNumber} attached.\n\nThank you,\n${brand}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
      <p>Hi ${sale.customer.name},</p>
      <p>Please find your invoice <strong>${sale.invoiceNumber}</strong> attached.</p>
      <p>Thank you,<br>${brand}</p>
    </div>`,
    attachments: [{ filename: `${sale.invoiceNumber}.pdf`, content: pdf.toString("base64") }],
  });

  if (!result.delivered) return { error: `Couldn't send the email (${result.reason}).` };
  return { message: `Invoice emailed to ${sale.customer.email}` };
}
