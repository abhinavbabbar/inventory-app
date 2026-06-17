import { PageHeader } from "@/components/ui";
import { ItemForm } from "../_components/item-form";
import { createItem } from "../actions";

export const metadata = { title: "New item · Inventory & P&L" };

export default function NewItemPage() {
  return (
    <div>
      <PageHeader title="New item" description="Add a new SKU to your catalog. Stock is added later via a shipment." />
      <ItemForm action={createItem} submitLabel="Create item" cancelHref="/inventory" />
    </div>
  );
}
