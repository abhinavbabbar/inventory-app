import Link from "next/link";

import {
  getKpis,
  getMonthlySeries,
  getPartnerShares,
  getRecentActivity,
  getTopItemsByProfit,
} from "@/lib/analytics";
import { formatAed, formatInr, formatNumber } from "@/lib/money";
import { getDefaultFxRate } from "@/lib/settings";
import { Prisma } from "@prisma/client";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { MonthlyChart } from "./_components/monthly-chart";

export const metadata = { title: "Dashboard · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function DashboardPage() {
  const [kpis, monthly, topItems, recent, fxRateStr] = await Promise.all([
    getKpis(),
    getMonthlySeries(12),
    getTopItemsByProfit(5),
    getRecentActivity(10),
    getDefaultFxRate(),
  ]);
  const partnerShares = await getPartnerShares(kpis.mtdNetProfitAed);

  const mtdLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  const hasAnyMonthlyData = monthly.some((m) => m.revenue !== 0 || m.cogs !== 0 || m.opex !== 0);

  // INR equivalent of AED amounts, using the Settings FX rate (INR→AED): inr = aed / fx.
  const fxRate = (() => {
    try {
      const r = new Prisma.Decimal(fxRateStr);
      return r.greaterThan(0) ? r : null;
    } catch {
      return null;
    }
  })();
  const inrEq = (aed: Prisma.Decimal): string | null =>
    fxRate ? `≈ ${formatInr(aed.div(fxRate))}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Snapshot for ${mtdLabel}.`}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs text-neutral-500">Total invested</div>
          <div className="text-xl font-semibold mt-1 tabular-nums text-emerald-700 dark:text-emerald-400">
            {kpis.totalInvestedAed.isZero() ? "—" : formatAed(kpis.totalInvestedAed)}
          </div>
          {!kpis.totalInvestedAed.isZero() && inrEq(kpis.totalInvestedAed) && (
            <div className="text-xs text-neutral-400 mt-1">{inrEq(kpis.totalInvestedAed)}</div>
          )}
        </Card>
        <Card className="p-4 border-l-4 border-l-cyan-500">
          <div className="text-xs text-neutral-500">Inventory value</div>
          <div className="text-xl font-semibold mt-1 tabular-nums text-cyan-700 dark:text-cyan-400">
            {kpis.inventoryValueAed.isZero() ? "—" : formatAed(kpis.inventoryValueAed)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {formatNumber(kpis.inventoryUnits)} units
            {!kpis.inventoryValueAed.isZero() && inrEq(kpis.inventoryValueAed) && (
              <span className="text-neutral-400"> · {inrEq(kpis.inventoryValueAed)}</span>
            )}
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-indigo-500">
          <div className="text-xs text-neutral-500">MTD revenue</div>
          <div className="text-xl font-semibold mt-1 tabular-nums text-indigo-700 dark:text-indigo-400">
            {kpis.mtdRevenueAed.isZero() ? "—" : formatAed(kpis.mtdRevenueAed)}
          </div>
          {!kpis.mtdRevenueAed.isZero() && inrEq(kpis.mtdRevenueAed) && (
            <div className="text-xs text-neutral-400 mt-1">{inrEq(kpis.mtdRevenueAed)}</div>
          )}
        </Card>
        <Card className={`p-4 border-l-4 ${kpis.mtdGrossProfitAed.isNegative() ? "border-l-red-500" : "border-l-violet-500"}`}>
          <div className="text-xs text-neutral-500">MTD gross profit</div>
          <div
            className={`text-xl font-semibold mt-1 tabular-nums ${
              kpis.mtdGrossProfitAed.isNegative() ? "text-red-600" : "text-violet-700 dark:text-violet-400"
            }`}
          >
            {kpis.mtdGrossProfitAed.isZero() ? "—" : formatAed(kpis.mtdGrossProfitAed)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            COGS {formatAed(kpis.mtdRevenueAed.sub(kpis.mtdGrossProfitAed))}
          </div>
        </Card>
        <Card className={`p-4 border-l-4 ${kpis.mtdNetProfitAed.isNegative() ? "border-l-red-500" : "border-l-green-500"}`}>
          <div className="text-xs text-neutral-500">MTD net profit</div>
          <div
            className={`text-xl font-semibold mt-1 tabular-nums ${
              kpis.mtdNetProfitAed.isNegative() ? "text-red-600" : "text-green-700 dark:text-green-400"
            }`}
          >
            {kpis.mtdNetProfitAed.isZero() ? "—" : formatAed(kpis.mtdNetProfitAed)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Opex {formatAed(kpis.mtdOpexAed)}
            {!kpis.mtdNetProfitAed.isZero() && inrEq(kpis.mtdNetProfitAed) && (
              <span className="text-neutral-400"> · {inrEq(kpis.mtdNetProfitAed)}</span>
            )}
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="text-xs text-neutral-500">Orders in progress</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">
            {kpis.inProgressOrdersCount > 0 ? kpis.inProgressOrdersCount : "—"}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {kpis.inProgressOrdersCount > 0 && (
              <Link href="/orders?status=IN_PROGRESS" className="text-neutral-500 hover:underline">
                {formatAed(kpis.inProgressOrdersValueAed)}
              </Link>
            )}
            {kpis.pendingAdvanceCount > 0 && (
              <StatusPill status="warn" label={`${kpis.pendingAdvanceCount} pending advance`} />
            )}
            {kpis.inProgressOrdersCount === 0 && (
              <span className="text-xs text-neutral-500">None</span>
            )}
          </div>
        </Card>
        <Card className={`p-4 border-l-4 ${kpis.outCount > 0 ? "border-l-red-500" : kpis.shortageCount > 0 ? "border-l-amber-500" : "border-l-neutral-300 dark:border-l-neutral-700"}`}>
          <div className="text-xs text-neutral-500">Stock alerts</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">
            {kpis.shortageCount + kpis.outCount > 0
              ? kpis.shortageCount + kpis.outCount
              : "—"}
          </div>
          <div className="mt-1 flex gap-1 flex-wrap">
            {kpis.outCount > 0 && (
              <StatusPill status="bad" label={`${kpis.outCount} out`} />
            )}
            {kpis.shortageCount > 0 && (
              <StatusPill status="warn" label={`${kpis.shortageCount} short`} />
            )}
            {kpis.outCount === 0 && kpis.shortageCount === 0 && (
              <span className="text-xs text-neutral-500">All in stock</span>
            )}
          </div>
        </Card>
        <Card className={`p-4 border-l-4 ${kpis.supplierDuesInr.greaterThan(0) ? "border-l-amber-500" : "border-l-neutral-300 dark:border-l-neutral-700"}`}>
          <div className="text-xs text-neutral-500">Supplier dues</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${kpis.supplierDuesInr.greaterThan(0) ? "text-amber-700 dark:text-amber-400" : ""}`}>
            {kpis.supplierDuesInr.greaterThan(0) ? formatInr(kpis.supplierDuesInr) : "—"}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {kpis.suppliersWithDues > 0 ? (
              <Link href="/suppliers" className="text-neutral-500 hover:underline">
                {kpis.suppliersWithDues} supplier{kpis.suppliersWithDues > 1 ? "s" : ""} owed
              </Link>
            ) : (
              <span className="text-neutral-500">All settled</span>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Revenue vs cost · last 12 months</h2>
            <p className="text-xs text-neutral-500">
              Net profit = Revenue − COGS − Opex, computed at the time of each sale.
            </p>
          </div>
        </div>
        {hasAnyMonthlyData ? (
          <MonthlyChart data={monthly} />
        ) : (
          <EmptyState
            title="No activity yet"
            description="Charts populate once you record your first sale or opex entry."
          />
        )}
      </Card>

      {/* Partners + Top items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">Partner shares</h2>
          {partnerShares.length === 0 ? (
            <EmptyState
              title="No partners recorded"
              description="Add partner investments in the Partners section to compute share percentages and profit splits."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Partner</TH>
                  <TH className="text-right">Invested</TH>
                  <TH className="text-right">Share</TH>
                  <TH className="text-right">MTD profit share</TH>
                </TR>
              </THead>
              <tbody>
                {partnerShares.map((p) => (
                  <TR key={p.partnerId}>
                    <TD>{p.name}</TD>
                    <TD className="text-right tabular-nums">{formatAed(p.investmentAed)}</TD>
                    <TD className="text-right tabular-nums">{p.sharePct.toFixed(2)}%</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        p.mtdProfitShareAed.isNegative() ? "text-red-600" : ""
                      }`}
                    >
                      {formatAed(p.mtdProfitShareAed)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">Top items by profit</h2>
          {topItems.length === 0 ? (
            <EmptyState
              title="No sales recorded yet"
              description="Top-selling items show up here once sales are recorded."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH className="text-right">Units sold</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">Gross profit</TH>
                </TR>
              </THead>
              <tbody>
                {topItems.map((row) => (
                  <TR key={row.itemId}>
                    <TD>
                      <Link href={`/inventory/${row.itemId}`} className="hover:underline">
                        {row.name}
                        <span className="font-mono text-xs text-neutral-500 ml-1">({row.sku})</span>
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(row.unitsSold)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(row.revenue)}</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        row.grossProfit.isNegative() ? "text-red-600" : "text-green-700 dark:text-green-400"
                      }`}
                    >
                      {formatAed(row.grossProfit)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-3">Recent activity</h2>
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Shipments and sales appear in this feed once recorded."
          />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {recent.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium shrink-0 ${
                      entry.kind === "shipment"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    }`}
                  >
                    {entry.kind === "shipment" ? "S" : "$"}
                  </span>
                  <div className="min-w-0">
                    {entry.kind === "shipment" ? (
                      <Link
                        href={`/shipments/${entry.id}`}
                        className="font-medium hover:underline truncate block"
                      >
                        Shipment {entry.reference}
                      </Link>
                    ) : (
                      <Link
                        href={`/sales/${entry.id}`}
                        className="font-medium hover:underline truncate block"
                      >
                        Sale {entry.invoiceNumber}
                      </Link>
                    )}
                    <div className="text-xs text-neutral-500">
                      {dateFmt.format(entry.at)} ·{" "}
                      {entry.kind === "shipment"
                        ? `${formatNumber(entry.units)} units · shipping ${formatInr(
                            entry.totalShippingInr,
                          )}`
                        : `${entry.customerName ?? "Walk-in"} · ${formatAed(entry.revenueAed)}`}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
