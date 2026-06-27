"use client";

import { useTransition } from "react";

type Action = () => Promise<void>;

export function EstimateControls({
  status,
  converted,
  onSent,
  onAccepted,
  onDeclined,
  onConvert,
  onDelete,
}: {
  status: string;
  converted: boolean;
  onSent: Action;
  onAccepted: Action;
  onDeclined: Action;
  onConvert: Action;
  onDelete: Action;
}) {
  const [pending, start] = useTransition();

  if (converted) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Delete this estimate? Its converted order is not affected.")) start(() => onDelete());
        }}
        className="h-9 px-3 rounded-md text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
      >
        Delete
      </button>
    );
  }

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
      {statusBtn("Accepted", "ACCEPTED", onAccepted)}
      {statusBtn("Declined", "DECLINED", onDeclined)}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Convert this estimate into an order?")) start(() => onConvert());
        }}
        className="h-9 px-3 rounded-md text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
      >
        Convert to order →
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Delete this estimate?")) start(() => onDelete());
        }}
        className="h-9 px-3 rounded-md text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
