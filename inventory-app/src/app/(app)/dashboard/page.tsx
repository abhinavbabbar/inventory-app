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
import { getCbuaeRate } from "@/lib/fx";
import { Prisma } from "@prisma/client";
import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { MonthlyChart } from "./_components/monthly-chart";

export const metadata = { title: "Dashboard · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

// Vibrant gradient KPI tile.
function Tile({ grad, children }: { grad: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl p-4 text-white shadow-lg shadow-indigo-500/15 bg-gradient-to-br ${grad}`}>
      {children}
    </div>
  );
}

export default async function DashboardPage() {
  const [kpis, monthly, topItems, recent, fxRateStr, liveRate] = await Promise.all([
    getKpis(),
    getMonthlySeries(12),
    getTopItemsByProfit(5),
    getRecentActivity(10),
    getDefaultFxRate(),
    getCbuaeRate(),
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

      {/* UAE Central Bank live FX rate */}
      <Link
        href="/settings"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/50 dark:border-white/10 bg-gradient-to-r from-cyan-50/80 to-indigo-50/70 dark:from-cyan-950/30 dark:to-indigo-950/30 backdrop-blur-md px-4 py-2.5 text-sm hover:from-cyan-100/80 hover:to-indigo-100/70 transition-colors"
      >
        <span className="font-medium text-cyan-800 dark:text-cyan-300">UAE Central Bank rate</span>
        <span className="tabular-nums text-neutral-700 dark:text-neutral-200">
          1 AED = ₹{liveRate.aedToInr.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
        </span>
        <span className="tabular-nums text-neutral-700 dark:text-neutral-200">
          1 INR = {liveRate.inrToAed.toLocaleString("en-AE", { maximumFractionDigits: 6 })} AED
        </span>
        <span className="text-neutral-400 ml-auto">
          {liveRate.source === "CBUAE"
            ? `Central Bank${liveRate.updatedLabel ? ` · ${liveRate.updatedLabel}` : ""}`
            : liveRate.source === "MARKET"
              ? "Market rate"
              : liveRate.source === "CACHE"
                ? "Recent rate"
                : "Saved rate"}{" "}
          · Convert →
        </span>
      </Link>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <Tile grad="from-emerald-500 to-teal-600">
          <div className="text-xs text-white/80">Total invested</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.totalInvestedAed.isZero() ? "—" : formatAed(kpis.totalInvestedAed)}
          </div>
          {!kpis.totalInvestedAed.isZero() && inrEq(kpis.totalInvestedAed) && (
            <div className="text-xs text-white/70 mt-1">{inrEq(kpis.totalInvestedAed)}</div>
          )}
        </Tile>
        <Tile grad="from-cyan-500 to-blue-600">
          <div className="text-xs text-white/80">Inventory value</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.inventoryValueAed.isZero() ? "—" : formatAed(kpis.inventoryValueAed)}
          </div>
          <div className="text-xs text-white/70 mt-1">
            {formatNumber(kpis.inventoryUnits)} units
            {!kpis.inventoryValueAed.isZero() && inrEq(kpis.inventoryValueAed) && (
              <span> · {inrEq(kpis.inventoryValueAed)}</span>
            )}
          </div>
        </Tile>
        <Tile grad="from-indigo-500 to-violet-600">
          <div className="text-xs text-white/80">MTD revenue</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.mtdRevenueAed.isZero() ? "—" : formatAed(kpis.mtdRevenueAed)}
          </div>
          {!kpis.mtdRevenueAed.isZero() && inrEq(kpis.mtdRevenueAed) && (
            <div className="text-xs text-white/70 mt-1">{inrEq(kpis.mtdRevenueAed)}</div>
          )}
        </Tile>
        <Tile grad={kpis.mtdGrossProfitAed.isNegative() ? "from-rose-500 to-red-600" : "from-violet-500 to-fuchsia-600"}>
          <div className="text-xs text-white/80">MTD gross profit</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.mtdGrossProfitAed.isZero() ? "—" : formatAed(kpis.mtdGrossProfitAed)}
          </div>
          <div className="text-xs text-white/70 mt-1">
            COGS {formatAed(kpis.mtdRevenueAed.sub(kpis.mtdGrossProfitAed))}
          </div>
        </Tile>
        <Tile grad={kpis.mtdNetProfitAed.isNegative() ? "from-rose-500 to-red-600" : "from-green-500 to-emerald-600"}>
          <div className="text-xs text-white/80">MTD net profit</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.mtdNetProfitAed.isZero() ? "—" : formatAed(kpis.mtdNetProfitAed)}
          </div>
          <div className="text-xs text-white/70 mt-1">
            Opex {formatAed(kpis.mtdOpexAed)}
            {!kpis.mtdNetProfitAed.isZero() && inrEq(kpis.mtdNetProfitAed) && (
              <span> · {inrEq(kpis.mtdNetProfitAed)}</span>
            )}
          </div>
        </Tile>
        <Tile grad="from-amber-500 to-orange-600">
          <div className="text-xs text-white/80">Orders in progress</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.inProgressOrdersCount > 0 ? kpis.inProgressOrdersCount : "—"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {kpis.inProgressOrdersCount > 0 && (
              <Link href="/orders?status=IN_PROGRESS" className="text-white/90 hover:underline">
                {formatAed(kpis.inProgressOrdersValueAed)}
              </Link>
            )}
            {kpis.pendingAdvanceCount > 0 && (
              <span className="rounded-full bg-white/25 px-2 py-0.5">{kpis.pendingAdvanceCount} pending advance</span>
            )}
            {kpis.inProgressOrdersCount === 0 && <span className="text-white/70">None</span>}
          </div>
        </Tile>
        <Tile grad={kpis.outCount > 0 ? "from-rose-500 to-red-600" : kpis.shortageCount > 0 ? "from-amber-500 to-orange-600" : "from-slate-400 to-slate-500"}>
          <div className="text-xs text-white/80">Stock alerts</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.shortageCount + kpis.outCount > 0 ? kpis.shortageCount + kpis.outCount : "—"}
          </div>
          <div className="mt-1 flex gap-1.5 flex-wrap text-xs">
            {kpis.outCount > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5">{kpis.outCount} out</span>}
            {kpis.shortageCount > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5">{kpis.shortageCount} short</span>}
            {kpis.outCount === 0 && kpis.shortageCount === 0 && <span className="text-white/70">All in stock</span>}
          </div>
        </Tile>
        <Tile grad={kpis.supplierDuesInr.greaterThan(0) ? "from-fuchsia-500 to-pink-600" : "from-slate-400 to-slate-500"}>
          <div className="text-xs text-white/80">Supplier dues</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {kpis.supplierDuesInr.greaterThan(0) ? formatInr(kpis.supplierDuesInr) : "—"}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {kpis.suppliersWithDues > 0 ? (
              <Link href="/suppliers" className="text-white/90 hover:underline">
                {kpis.suppliersWithDues} supplier{kpis.suppliersWithDues > 1 ? "s" : ""} owed
              </Link>
            ) : (
              <span className="text-white/70">All settled</span>
            )}
          </div>
        </Tile>
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
