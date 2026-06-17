import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { type Role } from "@/lib/domain";
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

export const metadata = { title: "Users · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  PARTNER: "Partner",
  STAFF: "Staff",
};

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Roles and access. Deactivating a user blocks sign-in but preserves their history."
        actions={<LinkButton href="/settings/users/new">+ New user</LinkButton>}
      />

      {users.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
              </TR>
            </THead>
            <tbody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <Link href={`/settings/users/${u.id}`} className="hover:underline">
                      {u.name}
                    </Link>
                    {u.id === session.user!.id && (
                      <span className="ml-2 text-xs text-neutral-500">(you)</span>
                    )}
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">{u.email}</TD>
                  <TD>{roleLabels[u.role as Role] ?? u.role}</TD>
                  <TD>
                    <StatusPill
                      status={u.isActive ? "ok" : "muted"}
                      label={u.isActive ? "Active" : "Inactive"}
                    />
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {dateFmt.format(u.createdAt)}
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
