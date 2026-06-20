import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { OpexForm } from "../_components/opex-form";
import { DeleteOpexButton } from "../_components/delete-opex-button";
import { updateOpex, deleteOpex } from "../actions";

export const metadata = { title: "Edit opex · Inventory & P&L" };

export default async function OpexDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await prisma.opexEntry.findUnique({ where: { id } });
  if (!entry) notFound();

  const partners = await prisma.partner.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { investedAt: "asc" },
  });
  const partnerOptions = partners.map((p) => ({ id: p.id, name: p.user.name }));

  const updateThis = updateOpex.bind(null, id);

  async function handleDelete() {
    "use server";
    await deleteOpex(id);
  }

  return (
    <div>
      <PageHeader title="Edit opex entry" />
      <OpexForm
        action={updateThis}
        partners={partnerOptions}
        submitLabel="Save changes"
        cancelHref="/opex"
        defaultValues={{
          category: entry.category,
          amountAed: (entry.amountAed as { toString: () => string }).toString(),
          incurredAt: entry.incurredAt.toISOString().slice(0, 10),
          paidByPartnerId: entry.paidByPartnerId,
          notes: entry.notes,
        }}
        extraActions={<DeleteOpexButton action={handleDelete} />}
      />
    </div>
  );
}
