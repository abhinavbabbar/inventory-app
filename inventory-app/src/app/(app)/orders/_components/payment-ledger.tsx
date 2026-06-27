"use client";

import { useActionState, useTransition } from "react";

import { Button, Card, Input, Label, Select } from "@/components/ui";
import { ORDER_PAYMENT_METHODS, ORDER_PAYMENT_METHOD_LABELS } from "@/lib/domain";
import type { OrderPaymentState } from "../actions";

type AddAction = (state: OrderPaymentState, formData: FormData) => Promise<OrderPaymentState>;

export function AddOrderPaymentForm({
  action,
  remaining,
}: {
  action: AddAction;
  remaining: number;
}) {
  const [state, formAction, pending] = useActionState<OrderPaymentState, FormData>(action, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction}>
      <Card className="p-5 space-y-4 border-l-4 border-l-emerald-500">
        <div>
          <h3 className="font-semibold">Record a payment</h3>
          <p className="text-xs text-neutral-500">
            Add each person&apos;s payment separately. The date can be back-dated to when it was actually received.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="payerName">Paid by</Label>
            <Input id="payerName" name="payerName" required maxLength={120} placeholder="e.g. Ahmed / Cash counter" />
          </div>
          <div>
            <Label htmlFor="amountAed">Amount (AED)</Label>
            <Input
              id="amountAed"
              name="amountAed"
              inputMode="decimal"
              required
              placeholder={remaining > 0 ? remaining.toFixed(2) : "0.00"}
            />
          </div>
          <div>
            <Label htmlFor="paidAt">Date received</Label>
            <Input id="paidAt" name="paidAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <Label htmlFor="method">Method <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Select id="method" name="method" defaultValue="">
              <option value="">—</option>
              {ORDER_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {ORDER_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="notes" name="notes" maxLength={300} placeholder="Reference, who/what, etc." />
          </div>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
          >
            {pending ? "Saving…" : "Add payment"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

export function DeleteOrderPaymentButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this payment?")) return;
        start(() => action());
      }}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
