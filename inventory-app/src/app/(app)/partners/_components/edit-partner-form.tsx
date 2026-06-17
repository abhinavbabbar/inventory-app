"use client";

import { useActionState } from "react";

import { Button, Card, LinkButton, Textarea, Label } from "@/components/ui";
import type { PartnerFormState } from "../actions";

type Props = {
  defaultValues: {
    notes: string | null;
  };
  action: (state: PartnerFormState, formData: FormData) => Promise<PartnerFormState>;
  extraActions?: React.ReactNode;
};

export function EditPartnerForm({ defaultValues, action, extraActions }: Props) {
  const [state, formAction, pending] = useActionState<PartnerFormState, FormData>(action, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={defaultValues.notes ?? ""} maxLength={500} />
          <p className="text-xs text-neutral-500 mt-1">
            Investment is managed through the contribution ledger below.
          </p>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <div>{extraActions}</div>
          <div className="flex items-center gap-2">
            <LinkButton href="/partners" variant="ghost">Cancel</LinkButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save notes"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
