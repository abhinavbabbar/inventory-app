"use client";

import { useActionState, useState } from "react";
import { Button, Card, Input, Label, LinkButton, Select, Textarea } from "@/components/ui";
import { OPEX_CATEGORIES, OPEX_CATEGORY_LABELS } from "@/lib/domain";
import type { OpexFormState } from "../actions";

const KNOWN = OPEX_CATEGORIES as readonly string[];

type PartnerOption = { id: string; name: string };

type Props = {
  defaultValues?: {
    category?: string; // an enum value, or a free-text label stored as "Other"
    amountAed?: string;
    incurredAt?: string; // YYYY-MM-DD
    paidByPartnerId?: string | null;
    notes?: string | null;
  };
  partners: PartnerOption[];
  action: (state: OpexFormState, formData: FormData) => Promise<OpexFormState>;
  submitLabel: string;
  cancelHref: string;
  extraActions?: React.ReactNode;
};

export function OpexForm({ defaultValues, partners, action, submitLabel, cancelHref, extraActions }: Props) {
  const [state, formAction, pending] = useActionState<OpexFormState, FormData>(action, {});
  const today = new Date().toISOString().slice(0, 10);

  // A stored category that isn't one of the known enum values is a custom
  // "Other" label — preselect Other and pre-fill the text box with it.
  const stored = defaultValues?.category;
  const storedIsCustom = !!stored && !KNOWN.includes(stored);
  const [category, setCategory] = useState<string>(
    stored ? (storedIsCustom ? "OTHER" : stored) : "RENT",
  );
  const [otherText, setOtherText] = useState(storedIsCustom ? stored! : "");

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {OPEX_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {OPEX_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
            {category === "OTHER" && (
              <div className="mt-2">
                <Input
                  name="categoryOther"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  maxLength={40}
                  placeholder="Specify category (e.g. Packaging, Bank fees)"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Optional — leave blank to just record it as &quot;Other&quot;.
                </p>
              </div>
            )}
            {state.errors?.category && <p className="text-xs text-red-600 mt-1">{state.errors.category}</p>}
          </div>
          <div>
            <Label htmlFor="amountAed">Amount (AED)</Label>
            <Input
              id="amountAed"
              name="amountAed"
              inputMode="decimal"
              defaultValue={defaultValues?.amountAed}
              required
            />
            {state.errors?.amountAed && (
              <p className="text-xs text-red-600 mt-1">{state.errors.amountAed}</p>
            )}
          </div>
          <div>
            <Label htmlFor="incurredAt">Date</Label>
            <Input
              id="incurredAt"
              name="incurredAt"
              type="date"
              defaultValue={defaultValues?.incurredAt ?? today}
              required
            />
            {state.errors?.incurredAt && (
              <p className="text-xs text-red-600 mt-1">{state.errors.incurredAt}</p>
            )}
          </div>
          <div>
            <Label htmlFor="paidByPartnerId">
              Paid by partner <span className="text-neutral-400 font-normal">(optional)</span>
            </Label>
            <Select
              id="paidByPartnerId"
              name="paidByPartnerId"
              defaultValue={defaultValues?.paidByPartnerId ?? ""}
              disabled={partners.length === 0}
            >
              <option value="">— Business funds (none) —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-neutral-500 mt-1">
              If a partner fronts this cost, it&apos;s tracked as a reimbursable amount they advanced. It does not affect equity or ownership share.
            </p>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes ?? ""} maxLength={500} />
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
