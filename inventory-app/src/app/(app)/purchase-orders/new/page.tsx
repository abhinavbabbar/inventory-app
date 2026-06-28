import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

import { PoForm } from "./_components/po-form";

export const metadata = { title: "New purchase order · BookWise" };

export default async function NewPurchaseOrderPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "purchaseOrders", "create")) redirect("/purchase-orders");

  const [suppliers, items] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
  ]);

  if (suppliers.length === 0) {
    return (
      <div>
        <PageHeader title="New purchase order" description="Order goods from a supplier." />
        <EmptyState
          title="No suppliers yet"
          description="Add a supplier before raising a purchase order."
          action={<LinkButton href="/suppliers/new">+ Add supplier</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="New purchase order" description="Order goods from a supplier (India side, INR)." />
      <PoForm suppliers={suppliers} items={items} />
    </div>
  );
}
