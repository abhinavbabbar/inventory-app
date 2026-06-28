import { prisma } from "@/lib/prisma";
import { getStockSummariesForItems } from "@/lib/items";
import { getVatSettings } from "@/lib/settings";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { OrderForm } from "./_components/order-form";

export const metadata = { title: "New order · BookWise" };

type SearchParams = { leadId?: string };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { leadId } = await searchParams;

  const [customers, items, vatSettings] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mobile: true, email: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true },
    }),
    getVatSettings(),
  ]);

  if (items.length === 0) {
    return (
      <div>
        <PageHeader title="New order" />
        <EmptyState
          title="No items in catalog yet"
          description="You need at least one item before you can record an order."
          action={<LinkButton href="/inventory/new">+ Create an item</LinkButton>}
        />
      </div>
    );
  }

  const summaries = await getStockSummariesForItems(items.map((i) => i.id));
  const itemsWithStock = items.map((i) => ({
    ...i,
    currentStock: summaries.get(i.id)?.currentStock ?? 0,
  }));

  let leadPrefill: React.ComponentProps<typeof OrderForm>["lead"] = undefined;
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (lead && lead.status !== "CONVERTED") {
      // Try to match an existing customer by mobile or email
      let matchedCustomerId: string | null = null;
      if (lead.mobile || lead.email) {
        const match = await prisma.customer.findFirst({
          where: {
            isActive: true,
            OR: [
              lead.mobile ? { mobile: lead.mobile } : {},
              lead.email ? { email: lead.email } : {},
            ].filter((c) => Object.keys(c).length > 0),
          },
          select: { id: true },
        });
        matchedCustomerId = match?.id ?? null;
      }
      leadPrefill = {
        id: lead.id,
        name: lead.name,
        mobile: lead.mobile,
        email: lead.email,
        deliveryAddress: lead.deliveryAddress,
        matchedCustomerId,
      };
    }
  }

  return (
    <div>
      <PageHeader title="New order" description="Stock is consumed at dispatch, not at order creation." />
      <OrderForm
        customers={customers}
        items={itemsWithStock}
        defaultVatRatePct={vatSettings.defaultRatePct}
        vatEnabled={vatSettings.enabled}
        lead={leadPrefill}
      />
    </div>
  );
}
