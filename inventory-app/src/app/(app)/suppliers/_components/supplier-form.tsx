"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, LinkButton, Textarea } from "@/components/ui";
import type { SupplierFormState } from "../actions";

type Props = {
  defaultValues?: {
    name?: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  action: (state: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  submitLabel: string;
  cancelHref: string;
  extraActions?: React.ReactNode;
};

export function SupplierForm({ defaultValues, action, submitLabel, cancelHref, extraActions }: Props) {
  const [state, formAction, pending] = useActionState<SupplierFormState, FormData>(action, {});
  const err = (k: string) => state.errors?.[k];

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="name">Supplier name</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required maxLength={200} />
            {err("name") && <p className="text-xs text-red-600 mt-1">{err("name")}</p>}
          </div>
          <div>
            <Label htmlFor="contactPerson">Contact person</Label>
            <Input id="contactPerson" name="contactPerson" defaultValue={defaultValues?.contactPerson ?? ""} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={defaultValues?.phone ?? ""} maxLength={40} placeholder="+91 …" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} maxLength={200} />
            {err("email") && <p className="text-xs text-red-600 mt-1">{err("email")}</p>}
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={defaultValues?.address ?? ""} maxLength={500} placeholder="City, India" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes ?? ""} maxLength={1000} />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <div>{extraActions}</div>
          <div className="flex items-center gap-2">
            <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
