"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ui";
import type { FxRate } from "@/lib/fx";
import { refreshLiveFxRate, applyLiveFxRateAsDefault } from "../actions";

type Direction = "AED_TO_INR" | "INR_TO_AED";

function fmt(n: number, currency: "AED" | "INR"): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(currency === "AED" ? "en-AE" : "en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const SOURCE_BADGE: Record<FxRate["source"], { label: string; cls: string }> = {
  CBUAE_LIVE: {
    label: "Live",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  CBUAE_CACHE: {
    label: "Cached",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  MANUAL: {
    label: "Saved rate",
    cls: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export function FxLiveCard({ rate, canEdit }: { rate: FxRate; canEdit: boolean }) {
  const [direction, setDirection] = useState<Direction>("AED_TO_INR");
  const [amount, setAmount] = useState("100");
  const [pending, startTransition] = useTransition();

  const fromCurrency = direction === "AED_TO_INR" ? "AED" : "INR";
  const toCurrency = direction === "AED_TO_INR" ? "INR" : "AED";
  const factor = direction === "AED_TO_INR" ? rate.aedToInr : rate.inrToAed;
  const parsed = Number.parseFloat(amount);
  const result = Number.isFinite(parsed) ? parsed * factor : NaN;

  const badge = SOURCE_BADGE[rate.source];
  const isLive = rate.source !== "MANUAL";

  return (
    <Card className="p-6 space-y-5 border-l-4 border-l-cyan-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Live exchange rate
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </h2>
          <p className="text-sm text-neutral-500">
            Source: Central Bank of the UAE (centralbank.ae)
            {rate.updatedLabel && isLive ? (
              <> · Updated {rate.updatedLabel}</>
            ) : rate.source === "MANUAL" ? (
              <> · Live feed unavailable, showing your saved rate</>
            ) : null}
          </p>
        </div>
      </div>

      {/* Headline rates, both directions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-cyan-50 dark:bg-cyan-900/20 px-4 py-3">
          <div className="text-xs text-neutral-500">1 AED equals</div>
          <div className="text-2xl font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
            ₹{rate.aedToInr.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">Indian Rupee</div>
        </div>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
          <div className="text-xs text-neutral-500">1 INR equals</div>
          <div className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {rate.inrToAed.toLocaleString("en-AE", { maximumFractionDigits: 6 })} AED
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">UAE Dirham</div>
        </div>
      </div>

      {/* Converter */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="text-sm font-medium">Convert</div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-neutral-500">From ({fromCurrency})</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm tabular-nums"
                placeholder="0"
              />
              <span className="text-sm font-medium text-neutral-500 w-10">{fromCurrency}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDirection((d) => (d === "AED_TO_INR" ? "INR_TO_AED" : "AED_TO_INR"))}
            aria-label="Swap direction"
            className="shrink-0 h-10 w-10 mx-auto rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center text-lg"
          >
            ⇄
          </button>

          <div className="flex-1">
            <label className="text-xs text-neutral-500">To ({toCurrency})</label>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-10 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 text-sm tabular-nums flex items-center font-semibold">
                {toCurrency === "INR" ? "₹" : ""}
                {fmt(result, toCurrency)}
              </div>
              <span className="text-sm font-medium text-neutral-500 w-10">{toCurrency}</span>
            </div>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await refreshLiveFxRate(); })}
            className="h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Working…" : "↻ Refresh"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await applyLiveFxRateAsDefault(); })}
            className="h-9 px-3 rounded-md bg-cyan-600 text-white text-sm hover:bg-cyan-700 disabled:opacity-50"
            title="Save the current CBUAE INR→AED rate as the app default"
          >
            Use as default rate
          </button>
        </div>
      )}
    </Card>
  );
}
