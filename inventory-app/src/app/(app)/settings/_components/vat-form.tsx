"use client";

import { useActionState, useState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { saveVatSettings, type SettingsFormState } from "../actions";

type Props = {
  defaultValues: {
    enabled: boolean;
    defaultRatePct: string;
    label: string;
    registrationNumber: string | null;
  };
  readOnly?: boolean;
};

export function VatForm({ defaultValues, readOnly }: Props) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveVatSettings, {});
  const [enabled, setEnabled] = useState(defaultValues.enabled);

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">VAT</h2>
          <p className="text-sm text-neutral-500">
            Controls the default tax line on sales and invoices. Each sale snapshots the rate at the time of save.
          </p>
        </div>

        <fieldset disabled={readOnly} className="space-y-4 disabled:opacity-60">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>Charge VAT on sales by default</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="defaultRatePct">Default rate (%)</Label>
              <Input
                id="defaultRatePct"
                name="defaultRatePct"
                inputMode="decimal"
                defaultValue={defaultValues.defaultRatePct}
                required
              />
              {state.errors?.defaultRatePct && (
                <p className="text-xs text-red-600 mt-1">{state.errors.defaultRatePct}</p>
              )}
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                name="label"
                defaultValue={defaultValues.label}
                required
                maxLength={32}
                placeholder="VAT, GST, etc."
              />
            </div>
            <div>
              <Label htmlFor="registrationNumber">Registration number (TRN)</Label>
              <Input
                id="registrationNumber"
                name="registrationNumber"
                defaultValue={defaultValues.registrationNumber ?? ""}
                maxLength={64}
              />
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            When disabled, the VAT line is hidden on invoices and new sales default to 0%. Users can still set a rate per sale.
          </p>
        </fieldset>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        {!readOnly && (
          <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save VAT settings"}
            </Button>
          </div>
        )}
      </Card>
    </form>
  );
}
