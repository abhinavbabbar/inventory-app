"use client";

import { useActionState } from "react";

import { Button, Card, Input, Label, LinkButton, Select } from "@/components/ui";
import { ROLES, type Role } from "@/lib/domain";
import type { UserFormState } from "../actions";

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  PARTNER: "Partner",
  STAFF: "Staff",
};

type Props = {
  defaultValues: { name: string; role: Role };
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  selfWarning?: boolean;
};

export function EditUserForm({ defaultValues, action, selfWarning }: Props) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <h2 className="text-lg font-semibold">Profile</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={defaultValues.name} required maxLength={200} />
            {state.errors?.name && <p className="text-xs text-red-600 mt-1">{state.errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" defaultValue={defaultValues.role} required>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
            {selfWarning && (
              <p className="text-xs text-amber-600 mt-1">You can&apos;t demote your own role.</p>
            )}
            {state.errors?.role && <p className="text-xs text-red-600 mt-1">{state.errors.role}</p>}
          </div>
        </div>

        {state.message && <p className="text-sm text-green-600">{state.message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <LinkButton href="/settings/users" variant="ghost">Cancel</LinkButton>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
