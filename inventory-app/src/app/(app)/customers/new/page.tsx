import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../_components/customer-form";
import { createCustomer } from "../actions";

export const metadata = { title: "New customer · BookWise" };

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="New customer" description="Add a buyer for repeat orders and delivery." />
      <CustomerForm action={createCustomer} submitLabel="Create customer" cancelHref="/customers" />
    </div>
  );
}
