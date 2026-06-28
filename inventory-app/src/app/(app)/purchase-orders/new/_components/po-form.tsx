"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { createPurchaseOrder, type PoFormState } from "../../actions";

type SupplierOption = { id: string; name: string };
type ItemOption = { id: string; sku: string; name: string };
type LineState = { itemId: string; quantity: string; unitPurchasePriceInr: string };

const emptyLine = (): LineState => ({ itemId: "", quantity: "1", unitPurchasePriceInr: "" });
const toNum = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

export function PoForm({ suppliers, items }: { suppliers: SupplierOption[]; items: ItemOption[] }) {
  const [state, formAction, pending] = useActionState<PoFormState, FormData>(createPurchaseOrder, {});
  const today = new Date().toISOString().slice(0, 10);
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const total = useMemo(() => lines.reduce((a, l) => a + toNum(l.quantity) * toNum(l.unitPurchasePriceInr), 0), [lines]);

  const updateLine = (i: number, patch: Partial<LineState>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const errs = state.errors ?? {};
  const fieldErr = (n: string) => errs.fields?.[n];
  const lineErr = (i: number, n: string) => errs.lines?.[i]?.[n];

  return (
    <form
      action={(fd) => {
        fd.set("lines", JSON.stringify(lines));
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
        <h2 className="text-lg font-semibold">Order details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="supplierId">Supplier</Label>
            <Select id="supplierId" name="supplierId" defaultValue="" required disabled={suppliers.length === 0}>
              <option value="">Pick a supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            {fieldErr("supplierId") && <p className="text-xs text-red-600 mt-1">{fieldErr("supplierId")}</p>}
          </div>
          <div>
            <Label htmlFor="orderedAt">Order date</Label>
            <Input id="orderedAt" name="orderedAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <Label htmlFor="expectedAt">Expected delivery <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="expectedAt" name="expectedAt" type="date" />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={500} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Line items (INR)</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Add line</Button>
        </div>
        <Table>
          <THead>
            <TR><TH>Item</TH><TH className="w-24 text-right">Qty</TH><TH className="w-40 text-right">Unit price (INR)</TH><TH className="w-36 text-right">Line total</TH><TH className="w-12" /></TR>
          </THead>
          <tbody>
            {lines.map((line, idx) => (
              <TR key={idx}>
                <TD>
                  <Select value={line.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })} required>
                    <option value="">Pick an item…</option>
                    {items.map((it) => (<option key={it.id} value={it.id}>{it.name} ({it.sku})</option>))}
                  </Select>
                  {lineErr(idx, "itemId") && <p className="text-xs text-red-600 mt-1">{lineErr(idx, "itemId")}</p>}
                </TD>
                <TD><Input type="number" min={1} step={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} className="text-right" required /></TD>
                <TD><Input inputMode="decimal" value={line.unitPurchasePriceInr} onChange={(e) => updateLine(idx, { unitPurchasePriceInr: e.target.value })} className="text-right" required /></TD>
                <TD className="text-right tabular-nums">₹{(toNum(line.quantity) * toNum(line.unitPurchasePriceInr)).toFixed(2)}</TD>
                <TD><button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1} className="text-neutral-400 hover:text-red-600 disabled:opacity-30" aria-label="Remove line">×</button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <div className="flex justify-end text-sm">
          <div><span className="text-neutral-500">Total: </span><span className="font-semibold tabular-nums">₹{total.toFixed(2)}</span></div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/purchase-orders" variant="ghost">Cancel</LinkButton>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create purchase order"}</Button>
      </div>
    </form>
  );
}
