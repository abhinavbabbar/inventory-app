"use client";

import { useActionState, useState } from "react";

import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { PartnerFormState } from "../actions";

type Props = {
  action: (state: PartnerFormState, formData: FormData) => Promise<PartnerFormState>;
};

const PRESETS = [10000, 25000, 50000, 100000];

export function AddContributionForm({ action }: Props) {
  const [state, formAction, pending] = useActionState<PartnerFormState, FormData>(action, {});
  const [amount, setAmount] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const errs = state.errors ?? {};
  const fieldErr = (name: string) => errs.fields?.[name];

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl border-l-4 border-l-emerald-500">
        <div>
          <h2 className="text-lg font-semibold">Add a contribution</h2>
          <p className="text-sm text-neutral-500">
            Record a new capital top-up. Each entry is dated and kept in the ledger; the running total updates automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amountAed">Amount (AED)</Label>
            <Input
              id="amountAed"
              name="amountAed"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="25000"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className="px-2.5 h-7 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  +{p.toLocaleString()}
                </button>
              ))}
            </div>
            {fieldErr("amountAed") && (
              <p className="text-xs text-red-600 mt-1">{fieldErr("amountAed")}</p>
            )}
          </div>
          <div>
            <Label htmlFor="contributedAt">Date</Label>
            <Input id="contributedAt" name="contributedAt" type="date" defaultValue={today} required />
            {fieldErr("contributedAt") && (
              <p className="text-xs text-red-600 mt-1">{fieldErr("contributedAt")}</p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" maxLength={500} placeholder="e.g. Q3 capital injection" />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="submit" disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700">
            {pending ? "Adding…" : "Add contribution"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
