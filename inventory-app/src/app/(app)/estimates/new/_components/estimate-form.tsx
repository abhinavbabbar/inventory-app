"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { createEstimate, type EstimateFormState } from "../../actions";

type CustomerOption = { id: string; name: string; mobile: string | null };
type ItemOption = { id: string; sku: string; name: string; unit: string; currentStock: number };
type LineState = { itemId: string; quantity: string; unitSalePriceAed: string };

const emptyLine = (): LineState => ({ itemId: "", quantity: "1", unitSalePriceAed: "" });
const toNum = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

export function EstimateForm({
  customers,
  items,
  defaultVatRatePct,
  vatEnabled,
}: {
  customers: CustomerOption[];
  items: ItemOption[];
  defaultVatRatePct: string;
  vatEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<EstimateFormState, FormData>(createEstimate, {});
  const today = new Date().toISOString().slice(0, 10);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [customerId, setCustomerId] = useState("");
  const [vatRate, setVatRate] = useState(vatEnabled ? defaultVatRatePct : "0");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const subtotal = useMemo(() => lines.reduce((a, l) => a + toNum(l.quantity) * toNum(l.unitSalePriceAed), 0), [lines]);
  const vatAmount = (subtotal * toNum(vatRate)) / 100;
  const total = subtotal + vatAmount;

  const updateLine = (i: number, patch: Partial<LineState>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const errs = state.errors ?? {};
  const fieldErr = (n: string) => errs.fields?.[n];
  const lineErr = (i: number, n: string) => errs.lines?.[i]?.[n];

  return (
    <form
      action={(fd) => {
        fd.set("customerMode", customerMode);
        fd.set("lines", JSON.stringify(lines));
        if (customerMode !== "existing") fd.set("customerId", "");
        if (customerMode !== "new") {
          fd.set("newCustomerName", "");
          fd.set("newCustomerMobile", "");
          fd.set("newCustomerEmail", "");
          fd.set("newCustomerAddress", "");
        }
        return formAction(fd);
      }}
      className="space-y-6"
    >
      {errs.form && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200 px-4 py-2 text-sm">
          {errs.form}
        </div>
      )}

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Customer</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={customers.length === 0}
            onClick={() => setCustomerMode("existing")}
            className={`px-3 h-8 rounded-full text-sm transition-colors ${customerMode === "existing" ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"} disabled:opacity-40`}
          >
            Existing customer
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode("new")}
            className={`px-3 h-8 rounded-full text-sm transition-colors ${customerMode === "new" ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"}`}
          >
            + New customer
          </button>
        </div>

        {customerMode === "existing" ? (
          <div>
            <Label htmlFor="customerId">Choose customer</Label>
            <Select id="customerId" name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Pick a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.mobile ? ` · ${c.mobile}` : ""}
                </option>
              ))}
            </Select>
            {fieldErr("customerId") && <p className="text-xs text-red-600 mt-1">{fieldErr("customerId")}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label htmlFor="newCustomerName">Name</Label><Input id="newCustomerName" name="newCustomerName" required maxLength={200} /></div>
            <div><Label htmlFor="newCustomerMobile">Mobile</Label><Input id="newCustomerMobile" name="newCustomerMobile" maxLength={32} /></div>
            <div><Label htmlFor="newCustomerEmail">Email</Label><Input id="newCustomerEmail" name="newCustomerEmail" type="email" maxLength={200} /></div>
            <div className="md:col-span-2"><Label htmlFor="newCustomerAddress">Delivery address</Label><Input id="newCustomerAddress" name="newCustomerAddress" maxLength={500} /></div>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Line items</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Add line</Button>
        </div>
        <Table>
          <THead>
            <TR><TH>Item</TH><TH className="w-24 text-right">Qty</TH><TH className="w-36 text-right">Unit price (AED)</TH><TH className="w-36 text-right">Line total</TH><TH className="w-12" /></TR>
          </THead>
          <tbody>
            {lines.map((line, idx) => (
              <TR key={idx}>
                <TD>
                  <Select value={line.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })} required>
                    <option value="">Pick an item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
                    ))}
                  </Select>
                  {lineErr(idx, "itemId") && <p className="text-xs text-red-600 mt-1">{lineErr(idx, "itemId")}</p>}
                </TD>
                <TD><Input type="number" min={1} step={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} className="text-right" required /></TD>
                <TD><Input inputMode="decimal" value={line.unitSalePriceAed} onChange={(e) => updateLine(idx, { unitSalePriceAed: e.target.value })} className="text-right" required /></TD>
                <TD className="text-right tabular-nums">AED {(toNum(line.quantity) * toNum(line.unitSalePriceAed)).toFixed(2)}</TD>
                <TD>
                  <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1} className="text-neutral-400 hover:text-red-600 disabled:opacity-30" aria-label="Remove line">×</button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Estimate details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label htmlFor="issuedAt">Date</Label><Input id="issuedAt" name="issuedAt" type="date" defaultValue={today} required /></div>
          <div><Label htmlFor="validUntil">Valid until <span className="text-neutral-400 font-normal">(optional)</span></Label><Input id="validUntil" name="validUntil" type="date" /></div>
          <div>
            <Label htmlFor="vatRatePct">VAT rate (%)</Label>
            <Input id="vatRatePct" name="vatRatePct" value={vatRate} onChange={(e) => setVatRate(e.target.value)} inputMode="decimal" required />
          </div>
          <div className="md:col-span-3"><Label htmlFor="notes">Notes</Label><Input id="notes" name="notes" maxLength={500} /></div>
        </div>
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-xs text-neutral-500">Subtotal</div><div className="font-medium tabular-nums">AED {subtotal.toFixed(2)}</div></div>
          <div><div className="text-xs text-neutral-500">VAT ({toNum(vatRate).toFixed(2)}%)</div><div className="font-medium tabular-nums">AED {vatAmount.toFixed(2)}</div></div>
          <div><div className="text-xs text-neutral-500">Total</div><div className="font-semibold tabular-nums">AED {total.toFixed(2)}</div></div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/estimates" variant="ghost">Cancel</LinkButton>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create estimate"}</Button>
      </div>
    </form>
  );
}
