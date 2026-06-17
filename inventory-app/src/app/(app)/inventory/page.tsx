import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getStockSummariesForItems, stockStatus } from "@/lib/items";
import { formatAed, formatNumber } from "@/lib/money";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusPill,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "@/components/ui";

export const metadata = {
  title: "Inventory · Inventory & P&L",
};

type SearchParams = {
  q?: string;
  status?: "ALL" | "OK" | "SHORTAGE" | "OUT";
  category?: string;
  page?: string;
  pageSize?: string;
};

const PAGE_SIZES = [10, 15];

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== "ALL") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, status = "ALL", category = "ALL" } = await searchParams;
  const sp = await searchParams;

  const pageSize = PAGE_SIZES.includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 10;
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  // Distinct categories for the dropdown.
  const categoryRows = await prisma.item.findMany({
    where: { isActive: true, category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  const categories = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => !!c);

  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      ...(category !== "ALL" ? { category } : {}),
      ...(q
        ? {
            OR: [
              { sku: { contains: q } },
              { name: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  const summaries = await getStockSummariesForItems(items.map((i) => i.id));

  const allRows = items
    .map((item) => {
      const summary = summaries.get(item.id);
      const stock = summary?.currentStock ?? 0;
      return {
        item,
        currentStock: stock,
        inventoryValueAed: summary?.inventoryValueAed,
        avgLandedCostAed: summary?.avgLandedCostAed,
        status: stockStatus(stock, item.reorderThreshold),
      };
    })
    .filter((row) => (status === "ALL" ? true : row.status === status));

  // Pagination (in memory — status is a computed field).
  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  const hasFilters = !!q || status !== "ALL" || category !== "ALL";

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Items, stock levels, reorder thresholds."
        actions={
          <LinkButton href="/inventory/new" variant="primary">
            + New item
          </LinkButton>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search SKU, name or category…"
          className="h-9 w-60 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          <option value="ALL">All status</option>
          <option value="OK">In stock</option>
          <option value="SHORTAGE">Shortage</option>
          <option value="OUT">Out of stock</option>
        </select>
        <select
          name="pageSize"
          defaultValue={String(pageSize)}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 text-sm"
        >
          Filter
        </button>
        {hasFilters && (
          <Link href="/inventory" className="text-sm text-neutral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {totalRows === 0 ? (
        <EmptyState
          title="No items match"
          description="Try adjusting filters, or add your first item."
          action={<LinkButton href="/inventory/new">+ New item</LinkButton>}
        />
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>SKU</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Reorder at</TH>
                  <TH className="text-right">Avg landed cost</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map(({ item, currentStock, avgLandedCostAed, status: s }) => (
                  <TR key={item.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/inventory/${item.id}`} className="hover:underline">
                        {item.sku}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/inventory/${item.id}`} className="hover:underline">
                        {item.name}
                      </Link>
                    </TD>
                    <TD>{item.category ?? <span className="text-neutral-400">—</span>}</TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(currentStock)} {item.unit}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {item.reorderThreshold > 0 ? formatNumber(item.reorderThreshold) : <span className="text-neutral-400">—</span>}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {avgLandedCostAed && currentStock > 0 ? (
                        formatAed(avgLandedCostAed)
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD>
                      <StatusPill
                        status={s === "OK" ? "ok" : s === "SHORTAGE" ? "warn" : "bad"}
                        label={s === "OK" ? "In stock" : s === "SHORTAGE" ? "Shortage" : "Out"}
                      />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>

          {/* Pagination footer */}
          <div className="mt-4 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
            <div>
              Showing {start + 1}–{Math.min(start + pageSize, totalRows)} of {totalRows}
            </div>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={`/inventory${buildQuery({ q, status, category, pageSize, page: page - 1 })}`}
                  className="h-8 px-3 inline-flex items-center rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  ← Prev
                </Link>
              ) : (
                <span className="h-8 px-3 inline-flex items-center rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700">
                  ← Prev
                </span>
              )}
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`/inventory${buildQuery({ q, status, category, pageSize, page: page + 1 })}`}
                  className="h-8 px-3 inline-flex items-center rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Next →
                </Link>
              ) : (
                <span className="h-8 px-3 inline-flex items-center rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700">
                  Next →
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
