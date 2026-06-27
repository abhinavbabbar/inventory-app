import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { OPEX_CATEGORIES, OPEX_CATEGORY_LABELS, type OpexCategory } from "@/lib/domain";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

export const metadata = { title: "Opex · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const categoryLabels = OPEX_CATEGORY_LABELS;

type SearchParams = { month?: string; category?: OpexCategory | "ALL" };

function monthBounds(monthYYYYMM?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed
  if (monthYYYYMM && /^\d{4}-\d{2}$/.test(monthYYYYMM)) {
    const [y, m] = monthYYYYMM.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  const label = from.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { from, to, label };
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}

export default async function OpexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { month, category = "ALL" } = await searchParams;
  const { from, to, label } = monthBounds(month);

  const entries = await prisma.opexEntry.findMany({
    where: {
      incurredAt: { gte: from, lt: to },
      ...(category !== "ALL" ? { category } : {}),
    },
    orderBy: { incurredAt: "desc" },
    include: { paidByPartner: { include: { user: { select: { name: true } } } } },
  });

  const total = sumDecimal(entries.map((e) => e.amountAed as Prisma.Decimal));

  // Category breakdown
  const byCategory = new Map<OpexCategory, Prisma.Decimal>();
  for (const e of entries) {
    const cat = e.category as OpexCategory;
    const prev = byCategory.get(cat) ?? new Prisma.Decimal(0);
    byCategory.set(cat, prev.add(e.amountAed as Prisma.Decimal));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opex"
        description="UAE operating expenses, tracked separately for net profit."
        actions={<LinkButton href="/opex/new">+ New entry</LinkButton>}
      />

      <form className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          name="month"
          defaultValue={month ?? currentMonthValue()}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          <option value="ALL">All categories</option>
          {OPEX_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 text-sm"
        >
          Apply
        </button>
        {(month || category !== "ALL") && (
          <Link href="/opex" className="text-sm text-neutral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile grad="from-rose-500 to-red-600" label={`${label} total`} value={formatAed(total)} />
        {OPEX_CATEGORIES.slice(0, 3).map((c) => {
          const v = byCategory.get(c);
          if (!v || v.isZero()) return null;
          return <StatTile key={c} grad="from-amber-500 to-orange-600" label={categoryLabels[c]} value={formatAed(v)} />;
        })}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title={`No opex in ${label}`}
          description="Add an entry for rent, salaries, utilities, or other UAE costs."
          action={<LinkButton href="/opex/new">+ New entry</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Paid by</TH>
                <TH>Notes</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <tbody>
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    <Link href={`/opex/${e.id}`} className="hover:underline">
                      {dateFmt.format(e.incurredAt)}
                    </Link>
                  </TD>
                  <TD>{categoryLabels[e.category as OpexCategory] ?? e.category}</TD>
                  <TD>
                    {e.paidByPartner ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 text-xs font-medium">
                        {e.paidByPartner.user.name}
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-xs">Business funds</span>
                    )}
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {e.notes ?? <span className="text-neutral-400">—</span>}
                  </TD>
                  <TD className="text-right tabular-nums">{formatAed(e.amountAed)}</TD>
                </TR>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Total</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(total)}</TD>
              </TR>
            </tfoot>
          </Table>
        </Card>
      )}
    </div>
  );
}
