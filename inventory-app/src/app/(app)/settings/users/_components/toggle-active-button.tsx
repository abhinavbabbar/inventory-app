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
      variant={isActive ? "danger" : "secondary"}
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          isActive &&
          !window.confirm("Deactivate this user? They can no longer sign in until reactivated.")
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
