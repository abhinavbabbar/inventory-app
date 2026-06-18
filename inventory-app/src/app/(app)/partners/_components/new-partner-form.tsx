"use client";

import { useActionState, useState } from "react";

import { Button, Card, Input, Label, LinkButton, Select, Textarea } from "@/components/ui";
import { createPartner, type PartnerFormState } from "../actions";

type UserOption = { id: string; name: string; email: string; role: string };

export function NewPartnerForm({
  users,
  defaultFxRate = "0.0445",
}: {
  users: UserOption[];
  defaultFxRate?: string;
}) {
  const [state, formAction, pending] = useActionState<PartnerFormState, FormData>(createPartner, {});
  const [mode, setMode] = useState<"existing" | "new">(users.length > 0 ? "existing" : "new");
  const [currency, setCurrency] = useState<"AED" | "INR">("AED");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState(defaultFxRate);

  const errs = state.errors ?? {};
  const fieldErr = (name: string) => errs.fields?.[name];

  const aedPreview = (() => {
    if (currency !== "INR") return null;
    const a = parseFloat(amount);
    const fx = parseFloat(fxRate);
    if (!isNaN(a) && !isNaN(fx) && a > 0 && fx > 0) {
      return (a * fx).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return null;
  })();

  return (
    <form action={formAction}>
      <input type="hidden" name="userMode" value={mode} />
      <input type="hidden" name="investmentCurrency" value={currency} />
      <Card className="p-6 space-y-4 max-w-2xl">
        {errs.form && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200 px-4 py-2 text-sm">
            {errs.form}
          </div>
        )}

        <div>
          <Label>Partner user</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              type="button"
              disabled={users.length === 0}
              onClick={() => setMode("existing")}
              className={`px-3 h-8 rounded-full text-sm transition-colors ${
                mode === "existing"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Existing user
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`px-3 h-8 rounded-full text-sm transition-colors ${
                mode === "new"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
            >
              + New user
            </button>
          </div>
        </div>

        {mode === "existing" ? (
          <div>
            <Label htmlFor="userId">Pick a user</Label>
            <Select id="userId" name="userId" defaultValue="" required>
              <option value="">Choose…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) — {u.role}
                </option>
              ))}
            </Select>
            <p className="text-xs text-neutral-500 mt-1">
              If their current role isn&apos;t PARTNER, it&apos;ll be promoted on save.
            </p>
            {fieldErr("userId") && <p className="text-xs text-red-600 mt-1">{fieldErr("userId")}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newUserName">Name</Label>
              <Input id="newUserName" name="newUserName" required maxLength={200} />
              {fieldErr("newUserName") && <p className="text-xs text-red-600 mt-1">{fieldErr("newUserName")}</p>}
            </div>
            <div>
              <Label htmlFor="newUserEmail">Email</Label>
              <Input id="newUserEmail" name="newUserEmail" type="email" required maxLength={200} />
              {fieldErr("newUserEmail") && <p className="text-xs text-red-600 mt-1">{fieldErr("newUserEmail")}</p>}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="newUserPassword">Temporary password</Label>
              <Input id="newUserPassword" name="newUserPassword" type="password" required minLength={8} maxLength={72} />
              {fieldErr("newUserPassword") && <p className="text-xs text-red-600 mt-1">{fieldErr("newUserPassword")}</p>}
              <p className="text-xs text-neutral-500 mt-1">
                Share this with the partner privately. They should change it after first login.
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-4">
          <div>
            <Label>Investment currency</Label>
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
              <Label htmlFor="investmentAmount">
                Initial investment ({currency === "AED" ? "AED" : "INR ₹"})
              </Label>
              <Input
                id="investmentAmount"
                name="investmentAmount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder={currency === "AED" ? "100000" : "5000000"}
              />
              {fieldErr("investmentAmount") && (
                <p className="text-xs text-red-600 mt-1">{fieldErr("investmentAmount")}</p>
              )}
            </div>

            {currency === "INR" && (
              <div>
                <Label htmlFor="investmentFxRate">FX rate (1 INR = ? AED)</Label>
                <Input
                  id="investmentFxRate"
                  name="investmentFxRate"
                  inputMode="decimal"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  required
                  placeholder="0.0445"
                />
                {aedPreview ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                    = AED {aedPreview}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400 mt-1">
                    Rate locked at contribution time.
                  </p>
                )}
                {fieldErr("investmentFxRate") && (
                  <p className="text-xs text-red-600 mt-1">{fieldErr("investmentFxRate")}</p>
                )}
              </div>
            )}

            <div className={currency === "INR" ? "md:col-span-2" : ""}>
              <Label htmlFor="notes">Notes <span className="text-neutral-400 font-normal">(optional)</span></Label>
              <Textarea id="notes" name="notes" maxLength={500} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <LinkButton href="/partners" variant="ghost">Cancel</LinkButton>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create partner"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
