import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { d, formatAed, sumDecimal } from "@/lib/money";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { ShareDonut } from "./_components/share-donut";
import { colorAt } from "@/lib/chart-colors";

export const metadata = { title: "Partners · BookWise" };

export default async function PartnersPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "partners", "view")) {
    redirect("/dashboard");
  }
  const isAdmin = session.user.role === "ADMIN";

  const partners = await prisma.partner.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { investedAt: "asc" },
  });

  // Lifetime net profit for share computation
  const [sales, opex] = await Promise.all([
    prisma.sale.findMany({
      select: {
        lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
      },
    }),
    prisma.opexEntry.findMany({ select: { amountAed: true } }),
  ]);

  let revenue = d(0);
  let cogs = d(0);
  for (const s of sales) {
    for (const l of s.lines) {
      revenue = revenue.add((l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity));
      cogs = cogs.add((l.unitCostAedSnapshot as Prisma.Decimal).mul(l.quantity));
    }
  }
  const totalOpex = sumDecimal(opex.map((o) => o.amountAed as Prisma.Decimal));
  const lifetimeNetProfit = revenue.sub(cogs).sub(totalOpex);

  const totalInvested = sumDecimal(partners.map((p) => p.investmentAed as Prisma.Decimal));

  const donutData = partners.map((p) => ({
    name: p.user.name,
    value: (p.investmentAed as Prisma.Decimal).toNumber(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partners"
        description="Investments and lifetime profit shares."
        actions={isAdmin && <LinkButton href="/partners/new">+ New partner</LinkButton>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs text-neutral-500">Total invested</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-700 dark:text-emerald-400">
            {totalInvested.isZero() ? "—" : formatAed(totalInvested)}
          </div>
        </Card>
        <Card className={`p-4 border-l-4 ${lifetimeNetProfit.isNegative() ? "border-l-red-500" : "border-l-indigo-500"}`}>
          <div className="text-xs text-neutral-500">Lifetime net profit</div>
          <div
            className={`text-2xl font-semibold mt-1 tabular-nums ${
              lifetimeNetProfit.isNegative() ? "text-red-600" : "text-indigo-700 dark:text-indigo-400"
            }`}
          >
            {revenue.isZero() && totalOpex.isZero() ? "—" : formatAed(lifetimeNetProfit)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Rev {formatAed(revenue)} · COGS {formatAed(cogs)} · Opex {formatAed(totalOpex)}
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="text-xs text-neutral-500">Partners</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{partners.length}</div>
        </Card>
      </div>

      {partners.length > 0 && !totalInvested.isZero() && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">Ownership split</h2>
          <ShareDonut data={donutData} />
        </Card>
      )}

      {partners.length === 0 ? (
        <EmptyState
          title="No partners yet"
          description={
            isAdmin
              ? "Add your first partner to track investment percentages and profit splits."
              : "An admin needs to add partners before share data appears."
          }
          action={isAdmin ? <LinkButton href="/partners/new">+ New partner</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Partner</TH>
                <TH>Email</TH>
                <TH className="text-right">Invested</TH>
                <TH className="text-right">Share</TH>
                <TH className="text-right">Lifetime profit share</TH>
              </TR>
            </THead>
            <tbody>
              {partners.map((p, i) => {
                const inv = p.investmentAed as Prisma.Decimal;
                const sharePct = totalInvested.isZero()
                  ? 0
                  : inv.div(totalInvested).mul(100).toNumber();
                const profitShare = totalInvested.isZero()
                  ? d(0)
                  : lifetimeNetProfit.mul(inv).div(totalInvested);
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: colorAt(i) }}
                        />
                        {isAdmin ? (
                          <Link href={`/partners/${p.id}`} className="hover:underline">
                            {p.user.name}
                          </Link>
                        ) : (
                          p.user.name
                        )}
                      </div>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">{p.user.email}</TD>
                    <TD className="text-right tabular-nums">{formatAed(inv)}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden sm:block w-24 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${sharePct}%`, backgroundColor: colorAt(i) }}
                          />
                        </div>
                        <span className="tabular-nums w-14 text-right">{sharePct.toFixed(2)}%</span>
                      </div>
                    </TD>
                    <TD
                      className={`text-right tabular-nums ${
                        profitShare.isNegative() ? "text-red-600" : ""
                      }`}
                    >
                      {formatAed(profitShare)}
                    </TD>
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
