import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStockSummariesForItems } from "@/lib/items";
import { getVatSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";

import { EstimateForm } from "./_components/estimate-form";

export const metadata = { title: "New estimate · Inventory & P&L" };

export default async function NewEstimatePage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "estimates", "create")) redirect("/estimates");

  const [customers, items, vat] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, mobile: true } }),
    prisma.item.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unit: true } }),
    getVatSettings(),
  ]);

  const summaries = await getStockSummariesForItems(items.map((i) => i.id));
  const itemOptions = items.map((i) => ({ ...i, currentStock: summaries.get(i.id)?.currentStock ?? 0 }));

  return (
    <div>
      <PageHeader title="New estimate" description="Create a quotation to send to a customer." />
      <EstimateForm
        customers={customers}
        items={itemOptions}
        defaultVatRatePct={vat.defaultRatePct}
        vatEnabled={vat.enabled}
      />
    </div>
  );
}
