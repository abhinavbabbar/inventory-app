import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "./_components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      role={session.user.role}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "User"}
      signOutAction={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
