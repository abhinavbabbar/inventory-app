"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";

export function ToggleAdvanceButton({
  paid,
  action,
}: {
  paid: boolean;
  action: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={paid ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
      onClick={() => start(() => action())}
    >
      {pending ? "…" : paid ? "Mark advance unpaid" : "Mark advance paid"}
    </Button>
  );
}

export function ToggleBalanceButton({
  paid,
  action,
}: {
  paid: boolean;
  action: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={paid ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
      onClick={() => start(() => action())}
    >
      {pending ? "…" : paid ? "Mark balance unpaid" : "Mark balance paid"}
    </Button>
  );
}

export function CancelOrderButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this order? It will be moved to CANCELLED status.")) return;
        start(() => action());
      }}
    >
      {pending ? "Cancelling…" : "Cancel order"}
    </Button>
  );
}

export function DispatchOrderButton({
  action,
  advancePaid,
  hasShortfall,
}: {
  action: () => Promise<{ error?: string } | void>;
  advancePaid: boolean;
  hasShortfall: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="primary"
      disabled={pending || hasShortfall}
      onClick={() => {
        if (hasShortfall) return;
        if (!advancePaid) {
          if (!window.confirm("Advance hasn't been marked paid. Dispatch anyway?")) return;
        } else {
          if (!window.confirm("Dispatch this order? Stock will be consumed and a sale invoice will be generated.")) {
            return;
          }
        }
        start(async () => {
          const result = await action();
          if (result && "error" in result && result.error) {
            window.alert(result.error);
          }
        });
      }}
    >
      {pending ? "Dispatching…" : "Dispatch & invoice"}
    </Button>
  );
}
