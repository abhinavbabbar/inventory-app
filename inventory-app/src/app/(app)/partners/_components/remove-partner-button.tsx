"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";

export function RemovePartnerButton({
  action,
  partnerName,
}: {
  action: () => Promise<void>;
  partnerName: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Remove ${partnerName} as a partner? Their user account is kept; only the investment record is removed.`,
          )
        ) {
          return;
        }
        start(() => action());
      }}
    >
      {pending ? "Removing…" : "Remove partner"}
    </Button>
  );
}
