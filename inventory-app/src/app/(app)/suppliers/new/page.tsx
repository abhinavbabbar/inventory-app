import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { SupplierForm } from "../_components/supplier-form";
import { createSupplier } from "../actions";

export const metadata = { title: "New supplier · Inventory & P&L" };

export default async function NewSupplierPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "suppliers", "create")) {
    redirect("/suppliers");
  }
  return (
    <div>
      <PageHeader title="New supplier" description="Add an India-side supplier you import from." />
      <SupplierForm action={createSupplier} submitLabel="Create supplier" cancelHref="/suppliers" />
    </div>
  );
}
