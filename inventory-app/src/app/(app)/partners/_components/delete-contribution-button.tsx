"use client";

import { useTransition } from "react";

export function DeleteContributionButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this contribution? The running total will be recalculated.")) {
          return;
        }
        start(() => action());
      }}
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-40"
      title="Delete contribution"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
