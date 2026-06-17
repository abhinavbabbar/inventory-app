import { PageHeader } from "@/components/ui";
import { LeadForm } from "../_components/lead-form";
import { createLead } from "../actions";

export const metadata = { title: "New lead · Inventory & P&L" };

export default function NewLeadPage() {
  return (
    <div>
      <PageHeader title="New lead" description="Capture a potential customer's contact info and interest." />
      <LeadForm action={createLead} submitLabel="Create lead" cancelHref="/leads" />
    </div>
  );
}
