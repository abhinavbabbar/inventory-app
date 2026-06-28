"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import type { ShippingAllocationMethod } from "@/lib/domain";
import { createShipment, type ShipmentFormState } from "../../actions";

type ItemOption = { id: string; sku: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };

type LineState = {
  itemId: string;
  quantity: string;
  unitPurchasePriceInr: string;
  manualShippingInr: string;
};

function emptyLine(): LineState {
  return { itemId: "", quantity: "1", unitPurchasePriceInr: "", manualShippingInr: "" };
}

function toNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Client-side preview math. The server recomputes with Decimal precision on submit.
function previewLines(args: {
  totalShipping: number;
  method: ShippingAllocationMethod;
  fxRate: number;
  lines: LineState[];
}): Array<{ allocated: number; landedPerUnit: number; valid: boolean }> {
  const { totalShipping, method, fxRate, lines } = args;

  const totals = lines.map((l) => ({
    qty: toNum(l.quantity),
    unit: toNum(l.unitPurchasePriceInr),
    manual: l.manualShippingInr.trim().length > 0 ? toNum(l.manualShippingInr) : null,
  }));

  let allocated: number[] = [];

  if (method === "EQUAL_PER_UNIT") {
    const totalUnits = totals.reduce((a, l) => a + l.qty, 0);
    allocated = totalUnits > 0 ? totals.map((l) => (totalShipping * l.qty) / totalUnits) : totals.map(() => 0);
  } else if (method === "WEIGHTED_BY_VALUE") {
    const values = totals.map((l) => l.qty * l.unit);
    const totalValue = values.reduce((a, b) => a + b, 0);
    allocated = totalValue > 0 ? values.map((v) => (totalShipping * v) / totalValue) : values.map(() => 0);
  } else {
    allocated = totals.map((l) => l.manual ?? 0);
  }

  return totals.map((l, i) => {
    const perUnitShipping = l.qty > 0 ? allocated[i] / l.qty : 0;
    return {
      allocated: allocated[i],
      landedPerUnit: (l.unit + perUnitShipping) * fxRate,
      valid: l.qty > 0 && l.unit >= 0,
    };
  });
}

type Prefill = {
  fromPurchaseOrderId: string;
  poNumber: string;
  supplierId: string | null;
  lines: Array<{ itemId: string; quantity: string; unitPurchasePriceInr: string }>;
};

export function ShipmentForm({
  items,
  suppliers,
  prefill,
}: {
  items: ItemOption[];
  suppliers: SupplierOption[];
  prefill?: Prefill;
}) {
  const [state, formAction, pending] = useActionState<ShipmentFormState, FormData>(
    createShipment,
    {},
  );

  const today = new Date().toISOString().slice(0, 10);
  const defaultRef = `SH-${today.replace(/-/g, "")}`;

  const [method, setMethod] = useState<ShippingAllocationMethod>("EQUAL_PER_UNIT");
  const [totalShipping, setTotalShipping] = useState("0");
  const [fxRate, setFxRate] = useState("0.0445");
  const [lines, setLines] = useState<LineState[]>(
    prefill?.lines.length
      ? prefill.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          unitPurchasePriceInr: l.unitPurchasePriceInr,
          manualShippingInr: "",
        }))
      : [emptyLine()],
  );

  const preview = useMemo(
    () =>
      previewLines({
        totalShipping: toNum(totalShipping),
        method,
        fxRate: toNum(fxRate),
        lines,
      }),
    [totalShipping, method, fxRate, lines],
  );

  const manualSum = useMemo(
    () =>
      method === "MANUAL"
        ? lines.reduce((a, l) => a + (toNum(l.manualShippingInr) || 0), 0)
        : null,
    [method, lines],
  );

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
        fd.set("lines", JSON.stringify(lines));
        return formAction(fd);
      }}
      className="space-y-6"
    >
      {prefill && (
        <>
          <input type="hidden" name="fromPurchaseOrderId" value={prefill.fromPurchaseOrderId} />
          <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-200 px-4 py-2 text-sm">
            Receiving purchase order <span className="font-medium">{prefill.poNumber}</span>. Adjust quantities, FX and
            shipping as needed — the PO is marked received when you save.
          </div>
        </>
      )}

      {errs.form && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200 px-4 py-2 text-sm">
          {errs.form}
        </div>
      )}

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Shipment details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" defaultValue={defaultRef} required maxLength={64} />
            {fieldErr("reference") && <p className="text-xs text-red-600 mt-1">{fieldErr("reference")}</p>}
          </div>
          <div>
            <Label htmlFor="supplierId">
              Supplier <span className="text-neutral-400 font-normal">(optional)</span>
            </Label>
            <Select id="supplierId" name="supplierId" defaultValue={prefill?.supplierId ?? ""} disabled={suppliers.length === 0}>
              <option value="">— No supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <p className="text-xs text-neutral-500 mt-1">
              Links this purchase to a supplier so you can track dues. Manage in Suppliers.
            </p>
          </div>
          <div>
            <Label htmlFor="shippedAt">Shipped on</Label>
            <Input id="shippedAt" name="shippedAt" type="date" defaultValue={today} required />
            {fieldErr("shippedAt") && <p className="text-xs text-red-600 mt-1">{fieldErr("shippedAt")}</p>}
          </div>
          <div>
            <Label htmlFor="arrivedAt">Arrived on <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="arrivedAt" name="arrivedAt" type="date" />
          </div>
          <div>
            <Label htmlFor="fxRateInrToAed">FX rate (1 INR → AED)</Label>
            <Input
              id="fxRateInrToAed"
              name="fxRateInrToAed"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              inputMode="decimal"
              required
              placeholder="0.0445"
            />
            {fieldErr("fxRateInrToAed") && (
              <p className="text-xs text-red-600 mt-1">{fieldErr("fxRateInrToAed")}</p>
            )}
          </div>
          <div>
            <Label htmlFor="totalShippingInr">Total shipping (INR)</Label>
            <Input
              id="totalShippingInr"
              name="totalShippingInr"
              value={totalShipping}
              onChange={(e) => setTotalShipping(e.target.value)}
              inputMode="decimal"
              required
            />
            {fieldErr("totalShippingInr") && (
              <p className="text-xs text-red-600 mt-1">{fieldErr("totalShippingInr")}</p>
            )}
          </div>
          <div>
            <Label htmlFor="shippingAllocationMethod">Shipping allocation</Label>
            <Select
              id="shippingAllocationMethod"
              name="shippingAllocationMethod"
              value={method}
              onChange={(e) => setMethod(e.target.value as ShippingAllocationMethod)}
              required
            >
              <option value="EQUAL_PER_UNIT">Equal per unit</option>
              <option value="WEIGHTED_BY_VALUE">Weighted by purchase value</option>
              <option value="MANUAL">Manual (enter per line)</option>
            </Select>
            <p className="text-xs text-neutral-500 mt-1">
              {method === "EQUAL_PER_UNIT"
                ? "Total shipping is split evenly across every unit."
                : method === "WEIGHTED_BY_VALUE"
                  ? "Expensive items absorb a larger share of shipping."
                  : "Enter the shipping amount for each line yourself; the sum must equal Total shipping (±₹1)."}
            </p>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input id="notes" name="notes" maxLength={500} />
          </div>
        </div>
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
              <TH className="w-36 text-right">Unit price (INR)</TH>
              {method === "MANUAL" && <TH className="w-36 text-right">Shipping (INR)</TH>}
              <TH className="w-32 text-right">Allocated</TH>
              <TH className="w-32 text-right">Landed (AED)</TH>
              <TH className="w-12" />
            </TR>
          </THead>
          <tbody>
            {lines.map((line, idx) => {
              const p = preview[idx];
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
                          {it.name} ({it.sku})
                        </option>
                      ))}
                    </Select>
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
                      value={line.unitPurchasePriceInr}
                      onChange={(e) => updateLine(idx, { unitPurchasePriceInr: e.target.value })}
                      className="text-right"
                      required
                    />
                  </TD>
                  {method === "MANUAL" && (
                    <TD>
                      <Input
                        inputMode="decimal"
                        value={line.manualShippingInr}
                        onChange={(e) => updateLine(idx, { manualShippingInr: e.target.value })}
                        className="text-right"
                      />
                    </TD>
                  )}
                  <TD className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    ₹{p.allocated.toFixed(2)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {p.valid ? `AED ${p.landedPerUnit.toFixed(4)}` : "—"}
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

        {method === "MANUAL" && manualSum !== null && (
          <p
            className={`text-sm ${
              Math.abs(manualSum - toNum(totalShipping)) > 1
                ? "text-red-600"
                : "text-neutral-500"
            }`}
          >
            Manual shipping sum: ₹{manualSum.toFixed(2)} / target ₹{toNum(totalShipping).toFixed(2)} (must match within ₹1)
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/shipments" variant="ghost">Cancel</LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create shipment"}
        </Button>
      </div>
    </form>
  );
}
