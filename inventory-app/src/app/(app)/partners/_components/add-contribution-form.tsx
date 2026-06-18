"use client";

import { useActionState, useState } from "react";

import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { PartnerFormState } from "../actions";

type Props = {
  action: (state: PartnerFormState, formData: FormData) => Promise<PartnerFormState>;
  defaultFxRate?: string;
};

const AED_PRESETS = [10000, 25000, 50000, 100000];
const INR_PRESETS = [100000, 500000, 1000000, 2500000];

export function AddContributionForm({ action, defaultFxRate = "0.0445" }: Props) {
  const [state, formAction, pending] = useActionState<PartnerFormState, FormData>(action, {});
  const [currency, setCurrency] = useState<"AED" | "INR">("AED");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState(defaultFxRate);
  const today = new Date().toISOString().slice(0, 10);
  const errs = state.errors ?? {};
  const fieldErr = (name: string) => errs.fields?.[name];

  // Live AED preview for INR contributions
  const aedPreview = (() => {
    if (currency !== "INR") return null;
    const a = parseFloat(amount);
    const fx = parseFloat(fxRate);
    if (!isNaN(a) && !isNaN(fx) && a > 0 && fx > 0) {
      return (a * fx).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return null;
  })();

  const presets = currency === "INR" ? INR_PRESETS : AED_PRESETS;
  const presetLabel = (p: number) =>
    currency === "INR"
      ? `₹${(p / 100000).toFixed(0)}L`
      : `+${p.toLocaleString()}`;

  return (
    <form action={formAction}>
      <input type="hidden" name="currency" value={currency} />
      <Card className="p-6 space-y-4 max-w-2xl border-l-4 border-l-emerald-500">
        <div>
          <h2 className="text-lg font-semibold">Add a contribution</h2>
          <p className="text-sm text-neutral-500">
            Record a new capital top-up. Each entry is dated and kept in the ledger; the running total updates automatically.
          </p>
        </div>

        {/* Currency toggle */}
        <div>
          <Label>Currency</Label>
          <div className="flex gap-2 mt-1">
            {(["AED", "INR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCurrency(c); setAmount(""); }}
                className={`px-4 h-8 rounded-full text-sm font-medium transition-colors ${
                  currency === c
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                }`}
              >
                {c === "AED" ? "AED (Dirham)" : "INR (Rupee)"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amountOriginal">
              Amount ({currency === "AED" ? "AED" : "INR ₹"})
            </Label>
            <Input
              id="amountOriginal"
              name="amountOriginal"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder={currency === "AED" ? "25000" : "500000"}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className="px-2.5 h-7 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  {presetLabel(p)}
                </button>
              ))}
            </div>
            {fieldErr("amountOriginal") && (
              <p className="text-xs text-red-600 mt-1">{fieldErr("amountOriginal")}</p>
            )}
          </div>

          {currency === "INR" ? (
            <div>
              <Label htmlFor="fxRateInrToAed">FX rate (1 INR = ? AED)</Label>
              <Input
                id="fxRateInrToAed"
                name="fxRateInrToAed"
                inputMode="decimal"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                required
                placeholder="0.0445"
              />
              {aedPreview ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                  = AED {aedPreview} (canonical equity value)
                </p>
              ) : (
                <p className="text-xs text-neutral-400 mt-1">
                  Pre-filled from settings; locked at contribution time.
                </p>
              )}
              {fieldErr("fxRateInrToAed") && (
                <p className="text-xs text-red-600 mt-1">{fieldErr("fxRateInrToAed")}</p>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="contributedAt">Date</Label>
              <Input id="contributedAt" name="contributedAt" type="date" defaultValue={today} required />
              {fieldErr("contributedAt") && (
                <p className="text-xs text-red-600 mt-1">{fieldErr("contributedAt")}</p>
              )}
            </div>
          )}

          {currency === "INR" && (
            <div>
              <Label htmlFor="contributedAt">Date</Label>
              <Input id="contributedAt" name="contributedAt" type="date" defaultValue={today} required />
              {fieldErr("contributedAt") && (
                <p className="text-xs text-red-600 mt-1">{fieldErr("contributedAt")}</p>
              )}
            </div>
          )}

          <div className={currency === "INR" ? "" : ""}>
            <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" maxLength={500} placeholder="e.g. Q3 capital injection" />
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}
        {errs.form && <p className="text-sm text-red-600">{errs.form}</p>}

        <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="submit" disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700">
            {pending ? "Adding…" : "Add contribution"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
