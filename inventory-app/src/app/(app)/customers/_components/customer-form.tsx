"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, LinkButton, Textarea } from "@/components/ui";
import type { CustomerFormState } from "../actions";

type CustomerFormProps = {
  defaultValues?: {
    name?: string;
    mobile?: string | null;
    email?: string | null;
    deliveryAddress?: string | null;
    notes?: string | null;
  };
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  submitLabel: string;
  cancelHref: string;
};

export function CustomerForm({ defaultValues, action, submitLabel, cancelHref }: CustomerFormProps) {
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(action, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required maxLength={200} />
            {state.errors?.name && <p className="text-xs text-red-600 mt-1">{state.errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="mobile">Mobile</Label>
            <Input
              id="mobile"
              name="mobile"
              defaultValue={defaultValues?.mobile ?? ""}
              maxLength={32}
              placeholder="+971 …"
            />
            {state.errors?.mobile && <p className="text-xs text-red-600 mt-1">{state.errors.mobile}</p>}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              maxLength={200}
            />
            {state.errors?.email && <p className="text-xs text-red-600 mt-1">{state.errors.email}</p>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="deliveryAddress">Delivery address</Label>
            <Textarea
              id="deliveryAddress"
              name="deliveryAddress"
              defaultValue={defaultValues?.deliveryAddress ?? ""}
              maxLength={500}
              placeholder="Street, city, country"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={defaultValues?.notes ?? ""}
              maxLength={1000}
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
