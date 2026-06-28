import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { formatAed, formatInr, formatNumber, sumDecimal } from "@/lib/money";
import {
  Button,
  Card,
  PageHeader,
  Select,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { setShipmentSupplier } from "../actions";

export const metadata = { title: "Shipment · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const methodLabel: Record<string, string> = {
  EQUAL_PER_UNIT: "Equal per unit",
  WEIGHTED_BY_VALUE: "Weighted by purchase value",
  MANUAL: "Manual per line",
};

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [shipment, session] = await Promise.all([
    prisma.shipment.findUnique({
      where: { id },
      include: {
        lines: { include: { item: true }, orderBy: { id: "asc" } },
        supplier: { select: { id: true, name: true } },
      },
    }),
    auth(),
  ]);
  if (!shipment) notFound();

  const canEditSupplier = !!session?.user && can(session.user, "shipments", "edit");
  const suppliers = canEditSupplier
    ? await prisma.supplier.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const setSupplierThis = setShipmentSupplier.bind(null, id);

  const totalUnits = shipment.lines.reduce((a, l) => a + l.quantity, 0);
  const totalInrLineValue = sumDecimal(
    shipment.lines.map((l) => (l.unitPurchasePriceInr as Prisma.Decimal).mul(l.quantity)),
  );
  const totalLandedAed = sumDecimal(
    shipment.lines.map((l) => (l.landedCostAed as Prisma.Decimal).mul(l.quantity)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.reference}
        description={
          <>
            Shipped {dateFmt.format(shipment.shippedAt)}
            {shipment.arrivedAt && <> · Arrived {dateFmt.format(shipment.arrivedAt)}</>} ·{" "}
            {methodLabel[shipment.shippingAllocationMethod]}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">FX rate</div>
          <div className="text-xl font-semibold mt-1">
            1 INR ={" "}
            <span className="tabular-nums">
              {(shipment.fxRateInrToAed as Prisma.Decimal).toString()}
            </span>{" "}
            AED
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Total shipping</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">
            {formatInr(shipment.totalShippingInr)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Total units</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatNumber(totalUnits)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Landed value</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatAed(totalLandedAed)}</div>
        </Card>
      </div>

      {/* Supplier */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-500">Supplier</div>
            <div className="mt-1 font-medium">
              {shipment.supplier ? (
                <Link href={`/suppliers/${shipment.supplier.id}`} className="hover:underline">
                  {shipment.supplier.name}
                </Link>
              ) : (
                <span className="text-neutral-400">Not linked to a supplier</span>
              )}
            </div>
          </div>
          {canEditSupplier && (
            suppliers.length === 0 ? (
              <Link href="/suppliers/new" className="text-sm text-neutral-600 hover:underline">
                + Add a supplier first
              </Link>
            ) : (
              <form action={setSupplierThis} className="flex items-center gap-2">
                <Select name="supplierId" defaultValue={shipment.supplier?.id ?? ""} className="h-9 w-56">
                  <option value="">— No supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" size="sm">Save</Button>
              </form>
            )
          )}
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold mb-3">Lines</h2>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit price (INR)</TH>
                <TH className="text-right">Line value (INR)</TH>
                <TH className="text-right">Allocated shipping</TH>
                <TH className="text-right">Landed cost / unit (AED)</TH>
              </TR>
            </THead>
            <tbody>
              {shipment.lines.map((line) => (
                <TR key={line.id}>
                  <TD>
                    <Link href={`/inventory/${line.itemId}`} className="hover:underline">
                      {line.item.name}{" "}
                      <span className="font-mono text-xs text-neutral-500">({line.item.sku})</span>
                    </Link>
                  </TD>
                  <TD className="text-right tabular-nums">{formatNumber(line.quantity)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatInr(line.unitPurchasePriceInr)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatInr((line.unitPurchasePriceInr as Prisma.Decimal).mul(line.quantity))}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatInr(line.allocatedShippingInr)}
                  </TD>
                  <TD className="text-right tabular-nums">{formatAed(line.landedCostAed)}</TD>
                </TR>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Total</TD>
                <TD className="text-right tabular-nums">{formatNumber(totalUnits)}</TD>
                <TD />
                <TD className="text-right tabular-nums">{formatInr(totalInrLineValue)}</TD>
                <TD className="text-right tabular-nums">
                  {formatInr(shipment.totalShippingInr)}
                </TD>
                <TD className="text-right tabular-nums">{formatAed(totalLandedAed)}</TD>
              </TR>
            </tfoot>
          </Table>
        </Card>
      </section>

      {shipment.notes && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <Card className="p-4 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
            {shipment.notes}
          </Card>
        </section>
      )}
    </div>
  );
}
