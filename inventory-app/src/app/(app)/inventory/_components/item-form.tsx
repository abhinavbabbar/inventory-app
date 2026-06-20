"use client";

import { useActionState } from "react";
import { LinkButton, Button, Input, Label, Card } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import type { ItemFormState } from "../actions";

type ItemFormProps = {
  defaultValues?: {
    sku?: string;
    name?: string;
    category?: string | null;
    unit?: string;
    reorderThreshold?: number;
    photoUrl?: string | null;
  };
  action: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  submitLabel: string;
  cancelHref: string;
};

export function ItemForm({ defaultValues, action, submitLabel, cancelHref }: ItemFormProps) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" defaultValue={defaultValues?.sku} required maxLength={64} />
            {state.errors?.sku && <p className="text-xs text-red-600 mt-1">{state.errors.sku}</p>}
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required maxLength={200} />
            {state.errors?.name && <p className="text-xs text-red-600 mt-1">{state.errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              defaultValue={defaultValues?.category ?? ""}
              placeholder="e.g. Apparel, Electronics"
              maxLength={64}
            />
          </div>
          <div>
            <Label htmlFor="unit">Unit</Label>
            <Input
              id="unit"
              name="unit"
              defaultValue={defaultValues?.unit ?? "pc"}
              required
              maxLength={16}
              placeholder="pc, kg, box, etc."
            />
          </div>
          <div>
            <Label htmlFor="reorderThreshold">Reorder threshold</Label>
            <Input
              id="reorderThreshold"
              name="reorderThreshold"
              type="number"
              min={0}
              step={1}
              defaultValue={defaultValues?.reorderThreshold ?? 0}
            />
            <p className="text-xs text-neutral-500 mt-1">Stock at or below this triggers a Shortage status.</p>
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              name="photoUrl"
              label="Item photo"
              defaultValue={defaultValues?.photoUrl}
              maxDim={600}
              format="image/jpeg"
              shape="wide"
              helpText="Shown on the item page. Resized automatically before saving."
            />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </Card>
    </form>
  );
}
