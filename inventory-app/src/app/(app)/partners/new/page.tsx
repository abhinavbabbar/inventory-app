import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { getDefaultFxRate } from "@/lib/settings";
import { NewPartnerForm } from "../_components/new-partner-form";

export const metadata = { title: "New partner · Inventory & P&L" };

export default async function NewPartnerPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/partners");
  }

  const [users, defaultFxRate] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, partner: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    getDefaultFxRate(),
  ]);

  return (
    <div>
      <PageHeader
        title="New partner"
        description="Pick an existing user or create a new one, then set their investment."
      />
      <NewPartnerForm users={users} defaultFxRate={defaultFxRate} />
    </div>
  );
}
