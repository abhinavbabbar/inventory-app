import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { NewUserForm } from "../_components/new-user-form";

export const metadata = { title: "New user · Inventory & P&L" };

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/settings/users");
  }
  return (
    <div>
      <PageHeader title="New user" description="Invite a teammate. They'll sign in with the password you set here." />
      <NewUserForm />
    </div>
  );
}
