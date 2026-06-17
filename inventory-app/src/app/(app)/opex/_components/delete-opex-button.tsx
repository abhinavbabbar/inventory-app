"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";

export function DeleteOpexButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this opex entry? This cannot be undone.")) return;
        start(() => action());
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
