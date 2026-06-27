import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { getCompanyInfo } from "@/lib/settings";
import { waLink } from "@/lib/whatsapp";
import { ESTIMATE_STATUS_LABELS, type EstimateStatus } from "@/lib/domain";
import { ShareActions } from "@/components/share-actions";
import { Card, LinkButton, PageHeader, StatusPill, Table, TD, TH, THead, TR } from "@/components/ui";

import { setEstimateStatus, convertEstimateToOrder, deleteEstimate, emailEstimate } from "../actions";
import { EstimateControls } from "./_components/estimate-controls";

export const metadata = { title: "Estimate · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const tone: Record<EstimateStatus, "ok" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  SENT: "warn",
  ACCEPTED: "ok",
  DECLINED: "bad",
  CONVERTED: "ok",
};

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !can(session.user, "estimates", "view")) redirect("/dashboard");

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { item: true }, orderBy: { id: "asc" } },
      convertedOrder: { select: { id: true, orderNumber: true } },
    },
  });
  if (!estimate) notFound();

  const subtotal = sumDecimal(estimate.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)));
  const total = subtotal.add(estimate.vatAmountAed as Prisma.Decimal);
  const st = estimate.status as EstimateStatus;
  const converted = st === "CONVERTED";

  const company = await getCompanyInfo();
  const brand = company.name || "Inventory & P&L";
  const waMessage = `Hi ${estimate.customer.name}, here's your quotation ${estimate.estimateNumber} from ${brand}. Total: ${formatAed(total)}.`;
  const waHref = waLink(estimate.customer.mobile, waMessage);

  const emailThis = emailEstimate.bind(null, id);

  async function onSent() { "use server"; await setEstimateStatus(id, "SENT"); }
  async function onAccepted() { "use server"; await setEstimateStatus(id, "ACCEPTED"); }
  async function onDeclined() { "use server"; await setEstimateStatus(id, "DECLINED"); }
  async function onConvert() { "use server"; await convertEstimateToOrder(id); }
  async function onDelete() { "use server"; await deleteEstimate(id); }

  return (
    <div className="space-y-6">
      <PageHeader
        title={estimate.estimateNumber}
        description={
          <>
            Issued {dateFmt.format(estimate.issuedAt)}
            {estimate.validUntil && <> · valid until {dateFmt.format(estimate.validUntil)}</>}
            {" · "}
            <StatusPill status={tone[st]} label={ESTIMATE_STATUS_LABELS[st]} />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/estimates/${estimate.id}/quote`} variant="secondary">Download quote</LinkButton>
            <ShareActions
              waHref={waHref}
              waLabel="WhatsApp"
              emailAction={emailThis}
              emailLabel="Email quote"
              emailHint={estimate.customer.email ? undefined : "No customer email on file"}
            />
          </div>
        }
      />

      {converted && estimate.convertedOrder && (
        <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
          <p className="text-sm text-green-900 dark:text-green-200">
            Converted to order{" "}
            <Link href={`/orders/${estimate.convertedOrder.id}`} className="font-mono font-medium hover:underline">
              {estimate.convertedOrder.orderNumber}
            </Link>
            {estimate.convertedAt && <> on {dateFmt.format(estimate.convertedAt)}</>}.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Customer</div>
          <div className="font-medium mt-1">{estimate.customer.name}</div>
          <div className="text-sm text-neutral-500 mt-1 whitespace-pre-wrap">
            {estimate.customer.mobile ?? ""}
            {estimate.customer.mobile && estimate.customer.email ? " · " : ""}
            {estimate.customer.email ?? ""}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Total</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{formatAed(total)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Subtotal {formatAed(subtotal)} · VAT {(estimate.vatRatePct as Prisma.Decimal).toString()}%
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Actions</div>
          <div className="mt-2">
            <EstimateControls
              status={st}
              converted={converted}
              onSent={onSent}
              onAccepted={onAccepted}
              onDeclined={onDeclined}
              onConvert={onConvert}
              onDelete={onDelete}
            />
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit price</TH>
              <TH className="text-right">Line total</TH>
            </TR>
          </THead>
          <tbody>
            {estimate.lines.map((line) => (
              <TR key={line.id}>
                <TD>
                  <Link href={`/inventory/${line.itemId}`} className="hover:underline">
                    {line.item.name} <span className="font-mono text-xs text-neutral-500">({line.item.sku})</span>
                  </Link>
                </TD>
                <TD className="text-right tabular-nums">{line.quantity}</TD>
                <TD className="text-right tabular-nums">{formatAed(line.unitSalePriceAed)}</TD>
                <TD className="text-right tabular-nums">{formatAed((line.unitSalePriceAed as Prisma.Decimal).mul(line.quantity))}</TD>
              </TR>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
            <TR><TD>Subtotal</TD><TD /><TD /><TD className="text-right tabular-nums">{formatAed(subtotal)}</TD></TR>
            <TR><TD>VAT ({(estimate.vatRatePct as Prisma.Decimal).toString()}%)</TD><TD /><TD /><TD className="text-right tabular-nums">{formatAed(estimate.vatAmountAed)}</TD></TR>
            <TR><TD className="font-semibold">Total</TD><TD /><TD /><TD className="text-right tabular-nums font-semibold">{formatAed(total)}</TD></TR>
          </tfoot>
        </Table>
      </Card>

      {estimate.notes && (
        <Card className="p-4 text-sm whitespace-pre-wrap">{estimate.notes}</Card>
      )}
    </div>
  );
}
