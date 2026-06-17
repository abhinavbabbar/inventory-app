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
        if (
          isActive &&
          !window.confirm("Hide this item from inventory? Stock and history are preserved.")
        ) {
          return;
        }
        start(() => action());
      }}
    >
      {pending ? "…" : isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
