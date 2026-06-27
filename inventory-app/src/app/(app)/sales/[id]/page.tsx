import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { getCompanyInfo } from "@/lib/settings";
import { waLink } from "@/lib/whatsapp";
import { ShareActions } from "@/components/share-actions";
import {
  Card,
  LinkButton,
  PageHeader,
  StatTile,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import { emailInvoice } from "./actions";

export const metadata = { title: "Sale · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { item: true }, orderBy: { id: "asc" } },
    },
  });
  if (!sale) notFound();

  const subtotal = sumDecimal(
    sale.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
  );
  const total = subtotal.add(sale.vatAmountAed as Prisma.Decimal);
  const cogs = sumDecimal(
    sale.lines.map((l) => (l.unitCostAedSnapshot as Prisma.Decimal).mul(l.quantity)),
  );
  const gross = subtotal.sub(cogs);

  const vatRate = (sale.vatRatePct as Prisma.Decimal).toString();

  const company = await getCompanyInfo();
  const brand = company.name || "Inventory & P&L";
  const waMessage = `Hi ${sale.customer?.name ?? "there"}, here's your invoice ${sale.invoiceNumber} from ${brand}. Total: ${formatAed(total)}. Thank you!`;
  const waHref = waLink(sale.customer?.mobile, waMessage);
  const emailThis = emailInvoice.bind(null, sale.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.invoiceNumber}
        description={
          <>
            Sold {dateFmt.format(sale.soldAt)}
            {sale.placeOfSale && (
              <>
                {" · "}
                <span className="inline-flex items-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 px-2 py-0.5 text-xs font-medium">
                  {sale.placeOfSale}
                </span>
              </>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/sales/${sale.id}/invoice`} variant="secondary">
              Download invoice
            </LinkButton>
            <ShareActions
              waHref={waHref}
              waLabel="WhatsApp"
              emailAction={emailThis}
              emailLabel="Email invoice"
              emailHint={sale.customer?.email ? undefined : "No customer email on file"}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Customer</div>
          {sale.customer ? (
            <div className="mt-1">
              <Link href={`/customers/${sale.customer.id}`} className="font-medium hover:underline">
                {sale.customer.name}
              </Link>
              <div className="text-sm text-neutral-500 mt-1 whitespace-pre-wrap">
                {sale.customer.mobile ?? ""}
                {sale.customer.mobile && sale.customer.email ? " · " : ""}
                {sale.customer.email ?? ""}
                {sale.customer.deliveryAddress && (
                  <>
                    {"\n"}
                    {sale.customer.deliveryAddress}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-1 font-medium text-neutral-500">Walk-in customer</div>
          )}
        </Card>
        <StatTile
          grad="from-indigo-500 to-violet-600"
          label="Total"
          value={formatAed(total)}
          sub={`Subtotal ${formatAed(subtotal)} · VAT ${vatRate}%`}
        />
        <StatTile
          grad={gross.isNegative() ? "from-rose-500 to-red-600" : "from-green-500 to-emerald-600"}
          label="Gross profit"
          value={formatAed(gross)}
          sub={`COGS ${formatAed(cogs)} · FIFO cost`}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Lines</h2>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right">Unit cost (FIFO)</TH>
                <TH className="text-right">Line total</TH>
                <TH className="text-right">Profit</TH>
              </TR>
            </THead>
            <tbody>
              {sale.lines.map((line) => {
                const lineTotal = (line.unitSalePriceAed as Prisma.Decimal).mul(line.quantity);
                const lineCost = (line.unitCostAedSnapshot as Prisma.Decimal).mul(line.quantity);
                const profit = lineTotal.sub(lineCost);
                return (
                  <TR key={line.id}>
                    <TD>
                      <Link href={`/inventory/${line.itemId}`} className="hover:underline">
                        {line.item.name}{" "}
                        <span className="font-mono text-xs text-neutral-500">({line.item.sku})</span>
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{line.quantity}</TD>
                    <TD className="text-right tabular-nums">{formatAed(line.unitSalePriceAed)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(line.unitCostAedSnapshot)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(lineTotal)}</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        profit.isNegative() ? "text-red-600" : "text-green-700 dark:text-green-400"
                      }`}
                    >
                      {formatAed(profit)}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Subtotal</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(subtotal)}</TD>
                <TD />
              </TR>
              <TR>
                <TD>VAT ({vatRate}%)</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(sale.vatAmountAed)}</TD>
                <TD />
              </TR>
              <TR>
                <TD className="font-semibold">Total</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums font-semibold">{formatAed(total)}</TD>
                <TD />
              </TR>
            </tfoot>
          </Table>
        </Card>
      </section>

      {sale.notes && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <Card className="p-4 text-sm whitespace-pre-wrap">{sale.notes}</Card>
        </section>
      )}
    </div>
  );
}
