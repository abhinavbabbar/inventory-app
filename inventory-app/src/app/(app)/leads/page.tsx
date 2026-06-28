import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/domain";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusPill,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

export const metadata = { title: "Leads · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const statusLabels: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

const statusTone: Record<LeadStatus, "ok" | "warn" | "bad" | "muted"> = {
  NEW: "warn",
  CONTACTED: "warn",
  QUALIFIED: "ok",
  CONVERTED: "ok",
  LOST: "muted",
};

type SearchParams = { q?: string; status?: LeadStatus | "ALL" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, status = "ALL" } = await searchParams;

  const leads = await prisma.lead.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { mobile: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
      ...(status !== "ALL" ? { status } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  // Counts per status for the filter chips
  const counts = await prisma.lead.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const countByStatus = new Map(counts.map((c) => [c.status as LeadStatus, c._count._all]));
  const total = counts.reduce((a, c) => a + c._count._all, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Track potential customers from first contact to converted order."
        actions={<LinkButton href="/leads/new">+ New lead</LinkButton>}
      />

      <form className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, mobile, or email…"
          className="h-9 w-72 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          <option value="ALL">All ({total})</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]} ({countByStatus.get(s) ?? 0})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 text-sm"
        >
          Filter
        </button>
        {(q || status !== "ALL") && (
          <Link href="/leads" className="text-sm text-neutral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads match"
          description="Capture interest from a potential customer, then move them through the funnel."
          action={<LinkButton href="/leads/new">+ New lead</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Mobile</TH>
                <TH>Source</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <tbody>
              {leads.map((lead) => (
                <TR key={lead.id}>
                  <TD>
                    <Link href={`/leads/${lead.id}`} className="hover:underline">
                      {lead.name}
                    </Link>
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {lead.mobile ?? <span className="text-neutral-400">—</span>}
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {lead.source ?? <span className="text-neutral-400">—</span>}
                  </TD>
                  <TD>
                    <StatusPill
                      status={statusTone[lead.status as LeadStatus]}
                      label={statusLabels[lead.status as LeadStatus] ?? lead.status}
                    />
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {dateFmt.format(lead.createdAt)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
