"use client";

import { useTransition } from "react";

type Action = () => Promise<void>;

export function PoControls({
  status,
  received,
  onSent,
  onConfirmed,
  onCancel,
  onDelete,
}: {
  status: string;
  received: boolean;
  onSent: Action;
  onConfirmed: Action;
  onCancel: Action;
  onDelete: Action;
}) {
  const [pending, start] = useTransition();

  const del = (
    <button
      type="button"
      disabled={pending}
      onClick={() => { if (window.confirm("Delete this purchase order?")) start(() => onDelete()); }}
      className="h-9 px-3 rounded-md text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
    >
      Delete
    </button>
  );

  if (received) return del;

  const statusBtn = (label: string, value: string, action: Action) => (
    <button
      type="button"
      disabled={pending || status === value}
      onClick={() => start(() => action())}
      className={`h-9 px-3 rounded-md border text-sm disabled:opacity-50 ${
        status === value
          ? "border-transparent bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {statusBtn("Mark sent", "SENT", onSent)}
      {statusBtn("Confirmed", "CONFIRMED", onConfirmed)}
      {status !== "CANCELLED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (window.confirm("Cancel this purchase order?")) start(() => onCancel()); }}
          className="h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancel PO
        </button>
      )}
      {del}
    </div>
  );
}
