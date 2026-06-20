"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { saveCompanyInfo, type SettingsFormState } from "../actions";

type Props = {
  defaultValues: { name: string; tagline: string; address: string; trn: string; logoUrl: string };
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
            <Label htmlFor="tagline">
              Tagline <span className="text-neutral-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={defaultValues.tagline}
              maxLength={120}
              placeholder="e.g. Handcrafted in India · Delivered in the UAE"
            />
            <p className="text-xs text-neutral-500 mt-1">Shown under your brand name on every receipt.</p>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={defaultValues.address} maxLength={500} />
          </div>
          <div>
            <Label htmlFor="trn">TRN / Tax ID</Label>
            <Input id="trn" name="trn" defaultValue={defaultValues.trn} maxLength={64} />
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              name="logoUrl"
              label="Brand logo"
              defaultValue={defaultValues.logoUrl}
              maxDim={400}
              format="image/png"
              shape="square"
              allowUrl
              helpText="Upload a file or paste an image URL. Printed on every invoice/receipt; PNG with a transparent background works best."
            />
          </div>
        </fieldset>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <a
            href="/settings/receipt-preview"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
          >
            Preview receipt ↗
          </a>
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save company info"}
            </Button>
          )}
        </div>
        <p className="text-xs text-neutral-400">
          Preview opens a sample receipt using your saved branding — save first to see changes.
        </p>
      </Card>
    </form>
  );
}
