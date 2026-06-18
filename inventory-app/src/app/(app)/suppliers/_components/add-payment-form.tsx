"use client";

import { useActionState, useState } from "react";

import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { SUPPLIER_PAYMENT_METHODS, SUPPLIER_PAYMENT_METHOD_LABELS } from "@/lib/domain";
import type { SupplierFormState } from "../actions";

type Props = {
  action: (state: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  outstandingInr: number;
};

export function AddPaymentForm({ action, outstandingInr }: Props) {
  const [state, formAction, pending] = useActionState<SupplierFormState, FormData>(action, {});
  const [amount, setAmount] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const err = (k: string) => state.errors?.[k];

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl border-l-4 border-l-emerald-500">
        <div>
          <h2 className="text-lg font-semibold">Record a payment</h2>
          <p className="text-sm text-neutral-500">
            Money paid to this supplier, in INR. Outstanding updates automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amountInr">Amount (INR)</Label>
            <Input
              id="amountInr"
              name="amountInr"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="50000"
            />
            {outstandingInr > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(outstandingInr))}
                className="mt-2 px-2.5 h-7 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                Pay full outstanding (₹{outstandingInr.toLocaleString("en-IN")})
              </button>
            )}
            {err("amountInr") && <p className="text-xs text-red-600 mt-1">{err("amountInr")}</p>}
          </div>
          <div>
            <Label htmlFor="paidAt">Date</Label>
            <Input id="paidAt" name="paidAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <Label htmlFor="method">Method <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Select id="method" name="method" defaultValue="">
              <option value="">—</option>
              {SUPPLIER_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{SUPPLIER_PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="reference">Reference <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="reference" name="reference" maxLength={120} placeholder="UTR / cheque no." />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" maxLength={500} />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="submit" disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700">
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
