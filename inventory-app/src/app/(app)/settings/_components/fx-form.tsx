"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { saveFxRate, type SettingsFormState } from "../actions";

type Props = {
  defaultValues: { defaultFxRate: string };
  readOnly?: boolean;
};

export function FxRateForm({ defaultValues, readOnly }: Props) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveFxRate, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Default FX rate</h2>
          <p className="text-sm text-neutral-500">
            Pre-fills the FX rate on new shipments. Each shipment locks its own rate at save time, so changing this won&apos;t affect historical landed costs.
          </p>
        </div>

        <fieldset disabled={readOnly} className="disabled:opacity-60">
          <div className="max-w-xs">
            <Label htmlFor="defaultFxRate">1 INR =</Label>
            <div className="flex items-center gap-2">
              <Input
                id="defaultFxRate"
                name="defaultFxRate"
                inputMode="decimal"
                defaultValue={defaultValues.defaultFxRate}
                required
              />
              <span className="text-sm text-neutral-500">AED</span>
            </div>
            {state.errors?.defaultFxRate && (
              <p className="text-xs text-red-600 mt-1">{state.errors.defaultFxRate}</p>
            )}
          </div>
        </fieldset>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        {!readOnly && (
          <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save FX rate"}
            </Button>
          </div>
        )}
      </Card>
    </form>
  );
}
