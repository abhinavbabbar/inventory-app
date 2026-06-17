import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Card, LinkButton, PageHeader, StatusPill } from "@/components/ui";
import { type LeadStatus } from "@/lib/domain";

import { LeadForm } from "../_components/lead-form";
import { DeleteLeadButton } from "../_components/delete-lead-button";
import { updateLead, deleteLead } from "../actions";

export const metadata = { title: "Edit lead · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const statusLabels: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      convertedOrder: { select: { id: true, orderNumber: true, status: true } },
    },
  });
  if (!lead) notFound();

  const isConverted = lead.status === "CONVERTED" && lead.convertedOrder != null;
  const updateThis = updateLead.bind(null, id);

  async function handleDelete() {
    "use server";
    await deleteLead(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.name}
        description={
          <span className="text-sm text-neutral-500">
            {lead.mobile ?? "—"} · {lead.email ?? "—"} · Created {dateFmt.format(lead.createdAt)}
          </span>
        }
        actions={
          isConverted ? null : (
            <LinkButton href={`/orders/new?leadId=${lead.id}`}>Convert to order →</LinkButton>
          )
        }
      />

      {isConverted && (
        <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill status="ok" label="Converted" />
                {lead.convertedAt && (
                  <span className="text-sm text-neutral-600">
                    on {dateFmt.format(lead.convertedAt)}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                This lead was converted to{" "}
                <Link
                  href={`/orders/${lead.convertedOrder!.id}`}
                  className="font-mono hover:underline"
                >
                  {lead.convertedOrder!.orderNumber}
                </Link>{" "}
                ({statusLabels[lead.convertedOrder!.status as LeadStatus] ?? lead.convertedOrder!.status}).
              </p>
            </div>
          </div>
        </Card>
      )}

      <LeadForm
        action={updateThis}
        submitLabel="Save changes"
        cancelHref="/leads"
        statusLocked={isConverted}
        defaultValues={{
          name: lead.name,
          mobile: lead.mobile,
          email: lead.email,
          deliveryAddress: lead.deliveryAddress,
          source: lead.source,
          notes: lead.notes,
          status: lead.status as LeadStatus,
        }}
        extraActions={!isConverted ? <DeleteLeadButton action={handleDelete} /> : undefined}
      />
    </div>
  );
}
