import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { getCompanyInfo, getDefaultFxRate, getVatSettings } from "@/lib/settings";
import { Card, LinkButton, PageHeader } from "@/components/ui";

import { CompanyInfoForm } from "./_components/company-info-form";
import { VatForm } from "./_components/vat-form";
import { FxRateForm } from "./_components/fx-form";

export const metadata = { title: "Settings · Inventory & P&L" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "settings", "view")) {
    redirect("/dashboard");
  }

  const canEdit = can(session.user, "settings", "edit");
  const isAdmin = session.user.role === "ADMIN";

  const [company, vat, fx] = await Promise.all([
    getCompanyInfo(),
    getVatSettings(),
    getDefaultFxRate(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company info, tax, and FX defaults. User management lives under its own section."
        actions={
          isAdmin && (
            <LinkButton href="/settings/users" variant="secondary">
              Manage users
            </LinkButton>
          )
        }
      />

      {!canEdit && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You can view settings but only admins can change them.
          </p>
        </Card>
      )}

      <CompanyInfoForm defaultValues={company} readOnly={!canEdit} />
      <VatForm defaultValues={vat} readOnly={!canEdit} />
      <FxRateForm defaultValues={{ defaultFxRate: fx }} readOnly={!canEdit} />

      {isAdmin && (
        <Card className="p-4 bg-neutral-50 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Users & roles</h3>
              <p className="text-sm text-neutral-500">
                Invite teammates, set roles, deactivate accounts.
              </p>
            </div>
            <Link href="/settings/users" className="text-sm hover:underline">
              Go to user management →
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
