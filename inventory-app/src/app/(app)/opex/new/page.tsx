import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { OpexForm } from "../_components/opex-form";
import { createOpex } from "../actions";

export const metadata = { title: "New opex entry · BookWise" };

export default async function NewOpexPage() {
  const partners = await prisma.partner.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { investedAt: "asc" },
  });
  const partnerOptions = partners.map((p) => ({ id: p.id, name: p.user.name }));

  return (
    <div>
      <PageHeader title="New opex entry" description="Record a UAE operating expense." />
      <OpexForm
        action={createOpex}
        partners={partnerOptions}
        submitLabel="Create entry"
        cancelHref="/opex"
      />
    </div>
  );
}
