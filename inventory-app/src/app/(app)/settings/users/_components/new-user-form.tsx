"use client";

import { useActionState } from "react";

import { Button, Card, Input, Label, LinkButton, Select } from "@/components/ui";
import { ROLES, type Role } from "@/lib/domain";
import { createUser, type UserFormState } from "../actions";

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  PARTNER: "Partner",
  STAFF: "Staff",
};

const roleHints: Record<Role, string> = {
  ADMIN: "Full access including user management",
  PARTNER: "Full operational access; can view but not edit partners/settings",
  STAFF: "Sales + inventory only by default",
};

export function NewUserForm() {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(createUser, {});

  return (
    <form action={formAction}>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={200} />
            {state.errors?.name && <p className="text-xs text-red-600 mt-1">{state.errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required maxLength={200} />
            {state.errors?.email && <p className="text-xs text-red-600 mt-1">{state.errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="password">Temporary password</Label>
            <Input id="password" name="password" type="password" required minLength={8} maxLength={72} />
            {state.errors?.password && <p className="text-xs text-red-600 mt-1">{state.errors.password}</p>}
            <p className="text-xs text-neutral-500 mt-1">Share privately. They should change it after first login.</p>
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" defaultValue="STAFF" required>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]} — {roleHints[r]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <LinkButton href="/settings/users" variant="ghost">Cancel</LinkButton>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
