import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { formatAed } from "@/lib/money";
import { getVatReturn, parseRange } from "@/lib/reports";
import { getVatSettings } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";

import { DateRangeForm } from "../_components/date-range";

export const metadata = { title: "VAT return summary · Reports" };

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !can(session.user, "reports", "view")) redirect("/dashboard");

  const range = parseRange(await searchParams);
  const [vat, settings] = await Promise.all([getVatReturn(range), getVatSettings()]);

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex items-center justify-between py-2 ${strong ? "border-t border-neutral-200 dark:border-neutral-800 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-neutral-600 dark:text-neutral-400"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT return summary"
        description={<><Link href="/reports" className="hover:underline">Reports</Link> · {range.label}</>}
      />
      <DateRangeForm basePath="/reports/vat" from={range.fromStr} to={range.toStr} />

      <Card className="p-6 max-w-2xl">
        <Row label="Standard-rated supplies (net)" value={formatAed(vat.standardRatedNet)} />
        <Row label="Zero / no-VAT supplies (net)" value={formatAed(vat.zeroRatedNet)} />
        <Row label="Output VAT collected" value={formatAed(vat.outputVat)} strong />
        <p className="text-xs text-neutral-500 mt-3">
          {settings.registrationNumber ? (
            <>TRN {settings.registrationNumber} · </>
          ) : null}
          {vat.invoiceCount} invoice{vat.invoiceCount === 1 ? "" : "s"} in this period. Output VAT is what you
          collected on sales. Input VAT on UAE purchases isn&apos;t tracked here (imports are billed in INR),
          so this is the output side of your VAT return.
        </p>
      </Card>
    </div>
  );
}
