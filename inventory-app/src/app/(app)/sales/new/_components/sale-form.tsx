"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { createSale, type SaleFormState } from "../../actions";

type CustomerOption = { id: string; name: string; mobile: string | null; email: string | null };
type ItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
};

type LineState = {
  itemId: string;
  quantity: string;
  unitSalePriceAed: string;
};

function emptyLine(): LineState {
  return { itemId: "", quantity: "1", unitSalePriceAed: "" };
}

function toNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

type CustomerMode = "existing" | "new" | "walkin";

type Props = {
  customers: CustomerOption[];
  items: ItemOption[];
  defaultVatRatePct: string;
  vatEnabled: boolean;
};

export function SaleForm({ customers, items, defaultVatRatePct, vatEnabled }: Props) {
  const [state, formAction, pending] = useActionState<SaleFormState, FormData>(createSale, {});

  const today = new Date().toISOString().slice(0, 10);

  const [customerMode, setCustomerMode] = useState<CustomerMode>(
    customers.length > 0 ? "existing" : "walkin",
  );
  const [customerId, setCustomerId] = useState("");
  const [vatRate, setVatRate] = useState(vatEnabled ? defaultVatRatePct : "0");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + toNum(l.quantity) * toNum(l.unitSalePriceAed), 0),
    [lines],
  );
  const vatAmount = useMemo(() => (subtotal * toNum(vatRate)) / 100, [subtotal, vatRate]);
  const total = subtotal + vatAmount;

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function updateLine(idx: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function stockWarning(idx: number): string | null {
    const l = lines[idx];
    if (!l.itemId) return null;
    const item = itemsById.get(l.itemId);
    if (!item) return null;
    const qty = toNum(l.quantity);
    if (qty > item.currentStock) {
      return `Only ${item.currentStock} ${item.unit} in stock`;
    }
    return null;
  }

  const errs = state.errors ?? {};
  const lineErr = (idx: number, name: string) => errs.lines?.[idx]?.[name];

  return (
    <form
      action={(fd) => {
        fd.set("lines", JSON.stringify(lines));
        // Clear customer fields the server should ignore for this mode.
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
          {(
            [
              { v: "existing" as const, label: "Existing customer", disabled: customers.length === 0 },
              { v: "new" as const, label: "+ New customer", disabled: false },
              { v: "walkin" as const, label: "Walk-in", disabled: false },
            ]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              disabled={opt.disabled}
              onClick={() => setCustomerMode(opt.v)}
              className={`px-3 h-8 rounded-full text-sm transition-colors ${
                customerMode === opt.v
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {customerMode === "existing" && (
          <div>
            <Label htmlFor="customerId">Choose customer</Label>
            <Select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Pick a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.mobile ? ` · ${c.mobile}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        {customerMode === "new" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newCustomerName">Name</Label>
              <Input id="newCustomerName" name="newCustomerName" required maxLength={200} />
            </div>
            <div>
              <Label htmlFor="newCustomerMobile">Mobile</Label>
              <Input id="newCustomerMobile" name="newCustomerMobile" maxLength={32} placeholder="+971 …" />
            </div>
            <div>
              <Label htmlFor="newCustomerEmail">Email</Label>
              <Input id="newCustomerEmail" name="newCustomerEmail" type="email" maxLength={200} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="newCustomerAddress">Delivery address</Label>
              <Input id="newCustomerAddress" name="newCustomerAddress" maxLength={500} />
            </div>
            <p className="text-xs text-neutral-500 md:col-span-2">
              We&apos;ll save this customer to your address book for future orders.
            </p>
          </div>
        )}

        {customerMode === "walkin" && (
          <p className="text-sm text-neutral-500">
            No customer record will be linked. The invoice will say &ldquo;Walk-in customer&rdquo;.
          </p>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Line items</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            + Add line
          </Button>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH className="w-24 text-right">Qty</TH>
              <TH className="w-36 text-right">Unit price (AED)</TH>
              <TH className="w-36 text-right">Line total</TH>
              <TH className="w-12" />
            </TR>
          </THead>
          <tbody>
            {lines.map((line, idx) => {
              const warn = stockWarning(idx);
              const lineTotal = toNum(line.quantity) * toNum(line.unitSalePriceAed);
              const selectedItem = itemsById.get(line.itemId);
              return (
                <TR key={idx}>
                  <TD>
                    <Select
                      value={line.itemId}
                      onChange={(e) => updateLine(idx, { itemId: e.target.value })}
                      required
                    >
                      <option value="">Pick an item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id} disabled={it.currentStock <= 0}>
                          {it.name} ({it.sku}) — {it.currentStock} {it.unit} in stock
                        </option>
                      ))}
                    </Select>
                    {selectedItem && (
                      <p className="text-xs text-neutral-500 mt-1">
                        Available: {selectedItem.currentStock} {selectedItem.unit}
                      </p>
                    )}
                    {warn && <p className="text-xs text-red-600 mt-1">{warn}</p>}
                    {lineErr(idx, "itemId") && (
                      <p className="text-xs text-red-600 mt-1">{lineErr(idx, "itemId")}</p>
                    )}
                  </TD>
                  <TD>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      className="text-right"
                      required
                    />
                  </TD>
                  <TD>
                    <Input
                      inputMode="decimal"
                      value={line.unitSalePriceAed}
                      onChange={(e) => updateLine(idx, { unitSalePriceAed: e.target.value })}
                      className="text-right"
                      required
                    />
                  </TD>
                  <TD className="text-right tabular-nums">
                    AED {lineTotal.toFixed(2)}
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="text-neutral-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Remove line"
                      title="Remove line"
                    >
                      ×
                    </button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Sale details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="soldAt">Sold on</Label>
            <Input id="soldAt" name="soldAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <Label htmlFor="placeOfSale">
              Place of sale <span className="text-neutral-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="placeOfSale"
              name="placeOfSale"
              list="place-of-sale-options"
              maxLength={100}
              placeholder="e.g. Exhibition"
            />
            <datalist id="place-of-sale-options">
              <option value="Store" />
              <option value="Exhibition" />
              <option value="Online" />
              <option value="Pop-up" />
              <option value="Market stall" />
              <option value="Delivery" />
            </datalist>
          </div>
          <div>
            <Label htmlFor="vatRatePct">VAT rate (%)</Label>
            <Input
              id="vatRatePct"
              name="vatRatePct"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              inputMode="decimal"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              {vatEnabled
                ? "Pre-filled from Settings. Set to 0 to skip VAT on this sale."
                : "VAT is disabled in Settings. Set a value here to apply it to this sale only."}
            </p>
          </div>
          <div>
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="notes" name="notes" maxLength={500} />
          </div>
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span className="tabular-nums">AED {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">VAT ({toNum(vatRate).toFixed(2)}%)</span>
                <span className="tabular-nums">AED {vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <span>Total</span>
                <span className="tabular-nums">AED {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/sales" variant="ghost">Cancel</LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record sale"}
        </Button>
      </div>
    </form>
  );
}
