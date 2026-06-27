import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import {
  PageHeader,
  Card,
  StatTile,
  Table,
  THead,
  TH,
  TR,
  TD,
  EmptyState,
} from "@/components/ui";
import { formatAed, formatInr } from "@/lib/money";
import { getDefaultFxRate } from "@/lib/settings";

import { EditPartnerForm } from "../_components/edit-partner-form";
import { RemovePartnerButton } from "../_components/remove-partner-button";
import { AddContributionForm } from "../_components/add-contribution-form";
import { DeleteContributionButton } from "../_components/delete-contribution-button";
import { ContributionChart } from "../_components/contribution-chart";
import { updatePartner, removePartner, addContribution, deleteContribution } from "../actions";

export const metadata = { title: "Edit partner · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/partners");
  }

  const defaultFxRate = await getDefaultFxRate();

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      investments: { orderBy: { contributedAt: "asc" } },
      opexEntries: { orderBy: { incurredAt: "desc" } },
    },
  });
  if (!partner) notFound();

  // Compute share % against all partners.
  const allPartners = await prisma.partner.findMany({ select: { investmentAed: true } });
  const totalAcrossPartners = allPartners.reduce(
    (acc, p) => acc.add(p.investmentAed as Prisma.Decimal),
    new Prisma.Decimal(0),
  );
  const sharePct = totalAcrossPartners.isZero()
    ? 0
    : (partner.investmentAed as Prisma.Decimal).div(totalAcrossPartners).mul(100).toNumber();

  // Split the total contribution into capital (ledger) vs opex paid.
  const capitalTotal = partner.investments.reduce(
    (acc, c) => acc.add(c.amountAed as Prisma.Decimal),
    new Prisma.Decimal(0),
  );
  const opexTotal = partner.opexEntries.reduce(
    (acc, e) => acc.add(e.amountAed as Prisma.Decimal),
    new Prisma.Decimal(0),
  );

  // Build cumulative-investment series for the chart.
  let running = 0;
  const chartData = partner.investments.map((c) => {
    running += (c.amountAed as Prisma.Decimal).toNumber();
    return {
      label: dateFmt.format(c.contributedAt),
      cumulative: running,
    };
  });

  const updateThis = updatePartner.bind(null, id);
  const addThis = addContribution.bind(null, id);

  async function handleRemove() {
    "use server";
    await removePartner(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={partner.user.name}
        description={
          <>
            {partner.user.email} · Joined {dateFmt.format(partner.investedAt)}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile grad="from-emerald-500 to-teal-600" label="Capital investment (equity)" value={formatAed(capitalTotal)} />
        <StatTile grad="from-indigo-500 to-violet-600" label="Ownership share" value={`${sharePct.toFixed(2)}%`} sub="from capital only" />
        <StatTile
          grad="from-amber-500 to-orange-600"
          label="Fronted costs (reimbursable)"
          value={opexTotal.isZero() ? "—" : formatAed(opexTotal)}
          sub="opex they paid · not equity"
        />
      </div>

      {/* Cumulative investment chart */}
      {chartData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">Investment over time</h2>
          <ContributionChart data={chartData} />
        </Card>
      )}

      {/* Add contribution */}
      <AddContributionForm action={addThis} defaultFxRate={defaultFxRate} />

      {/* Contribution ledger */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Contribution history</h2>
        {partner.investments.length === 0 ? (
          <EmptyState title="No contributions yet" description="Add the first capital contribution above." />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">AED (equity)</TH>
                  <TH className="text-right">Running total</TH>
                  <TH />
                </TR>
              </THead>
              <tbody>
                {(() => {
                  let cum = new Prisma.Decimal(0);
                  return partner.investments.map((c) => {
                    cum = cum.add(c.amountAed as Prisma.Decimal);
                    const deleteThis = deleteContribution.bind(null, id, c.id);
                    async function handleDelete() {
                      "use server";
                      await deleteThis();
                    }
                    const isInr = c.currency === "INR";
                    return (
                      <TR key={c.id}>
                        <TD className="text-neutral-600 dark:text-neutral-400">
                          {dateFmt.format(c.contributedAt)}
                        </TD>
                        <TD>{c.notes ?? <span className="text-neutral-400">—</span>}</TD>
                        <TD className="text-right tabular-nums font-medium">
                          {isInr ? (
                            <span className="text-indigo-700 dark:text-indigo-400">
                              +{formatInr(c.amountOriginal)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              +{formatAed(c.amountOriginal)}
                            </span>
                          )}
                        </TD>
                        <TD className="text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {isInr ? formatAed(c.amountAed) : <span className="text-neutral-400">—</span>}
                        </TD>
                        <TD className="text-right tabular-nums text-neutral-500">
                          {formatAed(cum)}
                        </TD>
                        <TD className="text-right">
                          {partner.investments.length > 1 && (
                            <DeleteContributionButton action={handleDelete} />
                          )}
                        </TD>
                      </TR>
                    );
                  });
                })()}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      {/* Fronted costs (reimbursable opex) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Fronted costs</h2>
            <p className="text-xs text-neutral-500">
              Opex this partner paid out of pocket — reimbursable, not part of equity or ownership share.
            </p>
          </div>
          {!opexTotal.isZero() && (
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium tabular-nums">
              {formatAed(opexTotal)} total
            </span>
          )}
        </div>
        {partner.opexEntries.length === 0 ? (
          <EmptyState
            title="No costs fronted by this partner"
            description="When recording an opex entry, set 'Paid by partner' to track the reimbursable amount here."
          />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Category</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <tbody>
                {partner.opexEntries.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      <Link href={`/opex/${e.id}`} className="hover:underline">
                        {dateFmt.format(e.incurredAt)}
                      </Link>
                    </TD>
                    <TD>{e.category}</TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {e.notes ?? <span className="text-neutral-400">—</span>}
                    </TD>
                    <TD className="text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                      {formatAed(e.amountAed)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      {/* Notes + remove */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Partner notes</h2>
        <EditPartnerForm
          action={updateThis}
          defaultValues={{ notes: partner.notes }}
          extraActions={
            <RemovePartnerButton action={handleRemove} partnerName={partner.user.name} />
          }
        />
      </section>
    </div>
  );
}
