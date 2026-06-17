"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import type { UserFormState } from "../actions";

type Props = {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
};

export function ResetPasswordForm({ action }: Props) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold">Reset password</h2>
          <p className="text-sm text-neutral-500">
            Sets a new password for this user. They&apos;ll need to re-login. Share the new password privately.
          </p>
        </div>

        <div className="max-w-sm">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required minLength={8} maxLength={72} />
          {state.errors?.password && <p className="text-xs text-red-600 mt-1">{state.errors.password}</p>}
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
