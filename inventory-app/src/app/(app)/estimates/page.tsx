import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { ESTIMATE_STATUS_LABELS, type EstimateStatus } from "@/lib/domain";
import { Card, EmptyState, LinkButton, PageHeader, StatusPill, Table, TD, TH, THead, TR } from "@/components/ui";

export const metadata = { title: "Estimates · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const tone: Record<EstimateStatus, "ok" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  SENT: "warn",
  ACCEPTED: "ok",
  DECLINED: "bad",
  CONVERTED: "ok",
};

export default async function EstimatesPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "estimates", "view")) redirect("/dashboard");

  const estimates = await prisma.estimate.findMany({
    orderBy: { issuedAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { select: { quantity: true, unitSalePriceAed: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Estimates"
        description="Quotations you can send to customers and convert into orders."
        actions={<LinkButton href="/estimates/new">+ New estimate</LinkButton>}
      />

      {estimates.length === 0 ? (
        <EmptyState
          title="No estimates yet"
          description="Create a quotation to send to a customer."
          action={<LinkButton href="/estimates/new">+ New estimate</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Estimate</TH>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <tbody>
              {estimates.map((e) => {
                const subtotal = sumDecimal(e.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)));
                const total = subtotal.add(e.vatAmountAed as Prisma.Decimal);
                const st = e.status as EstimateStatus;
                return (
                  <TR key={e.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/estimates/${e.id}`} className="hover:underline">{e.estimateNumber}</Link>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(e.issuedAt)}</TD>
                    <TD>
                      <Link href={`/customers/${e.customer.id}`} className="hover:underline">{e.customer.name}</Link>
                    </TD>
                    <TD><StatusPill status={tone[st]} label={ESTIMATE_STATUS_LABELS[st]} /></TD>
                    <TD className="text-right tabular-nums font-medium">{formatAed(total)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
