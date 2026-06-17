"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { createOrder, type OrderFormState } from "../../actions";

type CustomerOption = { id: string; name: string; mobile: string | null; email: string | null };
type ItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
};
type LeadPrefill = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  deliveryAddress: string | null;
  matchedCustomerId: string | null;
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

type CustomerMode = "existing" | "new";

type Props = {
  customers: CustomerOption[];
  items: ItemOption[];
  defaultVatRatePct: string;
  vatEnabled: boolean;
  lead?: LeadPrefill;
};

export function OrderForm({ customers, items, defaultVatRatePct, vatEnabled, lead }: Props) {
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(createOrder, {});

  const today = new Date().toISOString().slice(0, 10);

  // Defaults if coming from a lead
  const startWithExistingCustomer = lead?.matchedCustomerId != null || customers.length > 0;
  const [customerMode, setCustomerMode] = useState<CustomerMode>(
    lead && !lead.matchedCustomerId ? "new" : startWithExistingCustomer ? "existing" : "new",
  );
  const [customerId, setCustomerId] = useState(lead?.matchedCustomerId ?? "");
  const [vatRate, setVatRate] = useState(vatEnabled ? defaultVatRatePct : "0");
  const [advancePct, setAdvancePct] = useState("50");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + toNum(l.quantity) * toNum(l.unitSalePriceAed), 0),
    [lines],
  );
  const vatAmount = useMemo(() => (subtotal * toNum(vatRate)) / 100, [subtotal, vatRate]);
  const total = subtotal + vatAmount;
  const advanceAmount = (total * toNum(advancePct)) / 100;
  const balanceAmount = total - advanceAmount;

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

  const errs = state.errors ?? {};
  const fieldErr = (name: string) => errs.fields?.[name];
  const lineErr = (idx: number, name: string) => errs.lines?.[idx]?.[name];

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
        if (lead) fd.set("leadId", lead.id);
        return formAction(fd);
      }}
      className="space-y-6"
    >
      {errs.form && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200 px-4 py-2 text-sm">
          {errs.form}
        </div>
      )}

      {lead && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Converting lead <span className="font-medium">{lead.name}</span>
            {lead.mobile && ` · ${lead.mobile}`}
            {lead.email && ` · ${lead.email}`}
            . The lead will be marked CONVERTED when you create this order.
          </p>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Customer</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={customers.length === 0}
            onClick={() => setCustomerMode("existing")}
            className={`px-3 h-8 rounded-full text-sm transition-colors ${
              customerMode === "existing"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Existing customer
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode("new")}
            className={`px-3 h-8 rounded-full text-sm transition-colors ${
              customerMode === "new"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            + New customer
          </button>
        </div>

        {customerMode === "existing" ? (
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
                </option>
              ))}
            </Select>
            {fieldErr("customerId") && <p className="text-xs text-red-600 mt-1">{fieldErr("customerId")}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newCustomerName">Name</Label>
              <Input id="newCustomerName" name="newCustomerName" required maxLength={200} defaultValue={lead?.name ?? ""} />
            </div>
            <div>
              <Label htmlFor="newCustomerMobile">Mobile</Label>
              <Input id="newCustomerMobile" name="newCustomerMobile" maxLength={32} defaultValue={lead?.mobile ?? ""} />
            </div>
            <div>
              <Label htmlFor="newCustomerEmail">Email</Label>
              <Input id="newCustomerEmail" name="newCustomerEmail" type="email" maxLength={200} defaultValue={lead?.email ?? ""} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="newCustomerAddress">Delivery address</Label>
              <Input id="newCustomerAddress" name="newCustomerAddress" maxLength={500} defaultValue={lead?.deliveryAddress ?? ""} />
            </div>
          </div>
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
              const item = itemsById.get(line.itemId);
              const lineTotal = toNum(line.quantity) * toNum(line.unitSalePriceAed);
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
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.sku}) — {it.currentStock} {it.unit} in stock
                        </option>
                      ))}
                    </Select>
                    {item && (
                      <p className="text-xs text-neutral-500 mt-1">
                        Stock check happens at dispatch — current: {item.currentStock} {item.unit}
                      </p>
                    )}
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
                  <TD className="text-right tabular-nums">AED {lineTotal.toFixed(2)}</TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="text-neutral-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Remove line"
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
        <h2 className="text-lg font-semibold">Order details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="orderedAt">Order date</Label>
            <Input id="orderedAt" name="orderedAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <Label htmlFor="expectedDispatchAt">Expected dispatch <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="expectedDispatchAt" name="expectedDispatchAt" type="date" />
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
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={500} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Advance payment</h2>
        <div>
          <Label htmlFor="advancePct">Advance percentage</Label>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {["0", "50", "60", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAdvancePct(preset)}
                className={`px-3 h-9 rounded-md text-sm transition-colors ${
                  advancePct === preset
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {preset === "0" ? "No advance" : preset === "100" ? "Full upfront" : `${preset}%`}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-2">
              <Input
                id="advancePct"
                name="advancePct"
                value={advancePct}
                onChange={(e) => setAdvancePct(e.target.value)}
                inputMode="decimal"
                className="w-24 text-right"
                required
              />
              <span className="text-sm text-neutral-500">%</span>
            </div>
          </div>
          {fieldErr("advancePct") && (
            <p className="text-xs text-red-600 mt-1">{fieldErr("advancePct")}</p>
          )}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Subtotal</div>
              <div className="font-medium tabular-nums">AED {subtotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">VAT ({toNum(vatRate).toFixed(2)}%)</div>
              <div className="font-medium tabular-nums">AED {vatAmount.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Total</div>
              <div className="font-semibold tabular-nums">AED {total.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Advance / Balance</div>
              <div className="font-medium tabular-nums">
                AED {advanceAmount.toFixed(2)} / {balanceAmount.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/orders" variant="ghost">Cancel</LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
