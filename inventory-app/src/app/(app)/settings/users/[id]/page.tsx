import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { type Role } from "@/lib/domain";
import { Card, PageHeader, StatusPill } from "@/components/ui";

import { EditUserForm } from "../_components/edit-user-form";
import { ResetPasswordForm } from "../_components/reset-password-form";
import { ToggleActiveButton } from "../_components/toggle-active-button";
import { updateUser, resetUserPassword, toggleUserActive } from "../actions";

export const metadata = { title: "Edit user · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/settings/users");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  const isSelf = session.user.id === user.id;
  const updateThis = updateUser.bind(null, id);
  const resetThis = resetUserPassword.bind(null, id);

  async function handleToggle() {
    "use server";
    await toggleUserActive(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description={
          <>
            {user.email} · Joined {dateFmt.format(user.createdAt)}
          </>
        }
        actions={
          isSelf ? (
            <span className="text-xs text-neutral-500">This is you</span>
          ) : (
            <ToggleActiveButton isActive={user.isActive} action={handleToggle} />
          )
        }
      />

      <Card className="p-4 max-w-2xl flex items-center justify-between">
        <div className="text-sm text-neutral-500">Account status</div>
        <StatusPill
          status={user.isActive ? "ok" : "muted"}
          label={user.isActive ? "Active" : "Inactive"}
        />
      </Card>

      <EditUserForm
        defaultValues={{ name: user.name, role: user.role as Role }}
        action={updateThis}
        selfWarning={isSelf}
      />

      <ResetPasswordForm action={resetThis} />
    </div>
  );
}
