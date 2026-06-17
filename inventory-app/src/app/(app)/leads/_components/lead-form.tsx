"use client";

import { useActionState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Textarea } from "@/components/ui";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/domain";
import type { LeadFormState } from "../actions";

const statusLabels: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  LOST: "Lost",
};

type Props = {
  defaultValues?: {
    name?: string;
    mobile?: string | null;
    email?: string | null;
    deliveryAddress?: string | null;
    source?: string | null;
    notes?: string | null;
    status?: LeadStatus;
  };
  action: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  submitLabel: string;
  cancelHref: string;
  statusLocked?: boolean;
  extraActions?: React.ReactNode;
};

export function LeadForm({
  defaultValues,
  action,
  submitLabel,
  cancelHref,
  statusLocked,
  extraActions,
}: Props) {
  const [state, formAction, pending] = useActionState<LeadFormState, FormData>(action, {});

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
            <Input id="mobile" name="mobile" defaultValue={defaultValues?.mobile ?? ""} maxLength={32} placeholder="+971 …" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} maxLength={200} />
            {state.errors?.email && <p className="text-xs text-red-600 mt-1">{state.errors.email}</p>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="deliveryAddress">Delivery address</Label>
            <Textarea
              id="deliveryAddress"
              name="deliveryAddress"
              defaultValue={defaultValues?.deliveryAddress ?? ""}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="source">Source <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input
              id="source"
              name="source"
              defaultValue={defaultValues?.source ?? ""}
              maxLength={64}
              placeholder="e.g. referral, instagram, walk-in"
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "NEW"}
              disabled={statusLocked}
              required
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </Select>
            {statusLocked && (
              <p className="text-xs text-neutral-500 mt-1">
                Status is locked because this lead has been converted.
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes ?? ""} maxLength={1000} />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <div>{extraActions}</div>
          <div className="flex items-center gap-2">
            <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
