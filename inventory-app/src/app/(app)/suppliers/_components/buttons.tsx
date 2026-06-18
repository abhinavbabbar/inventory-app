"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";

export function ToggleActiveButton({
  isActive,
  action,
}: {
  isActive: boolean;
  action: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (isActive && !window.confirm("Hide this supplier from active lists? History is kept.")) return;
        start(() => action());
      }}
    >
      {pending ? "…" : isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

export function DeletePaymentButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this payment? The outstanding balance will be recalculated.")) return;
        start(() => action());
      }}
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-40"
      title="Delete payment"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
