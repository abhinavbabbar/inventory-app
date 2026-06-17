"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { saveCompanyInfo, type SettingsFormState } from "../actions";

type Props = {
  defaultValues: { name: string; address: string; trn: string; logoUrl: string };
  readOnly?: boolean;
};

export function CompanyInfoForm({ defaultValues, readOnly }: Props) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveCompanyInfo, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Company info</h2>
          <p className="text-sm text-neutral-500">Shown at the top of every invoice PDF.</p>
        </div>

        <fieldset disabled={readOnly} className="grid grid-cols-1 md:grid-cols-2 gap-4 disabled:opacity-60">
          <div className="md:col-span-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" name="name" defaultValue={defaultValues.name} required maxLength={200} />
            {state.errors?.name && <p className="text-xs text-red-600 mt-1">{state.errors.name}</p>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={defaultValues.address} maxLength={500} />
          </div>
          <div>
            <Label htmlFor="trn">TRN / Tax ID</Label>
            <Input id="trn" name="trn" defaultValue={defaultValues.trn} maxLength={64} />
          </div>
          <div>
            <Label htmlFor="logoUrl">Logo URL <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="logoUrl" name="logoUrl" defaultValue={defaultValues.logoUrl} maxLength={500} placeholder="https://…" />
          </div>
        </fieldset>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        {!readOnly && (
          <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save company info"}
            </Button>
          </div>
        )}
      </Card>
    </form>
  );
}
