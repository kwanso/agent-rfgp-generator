"use client";

import { useTransition } from "react";
import { setRole } from "@/app/actions";
import { ROLES, type Role } from "@/lib/workflow";

export function RoleSwitcher({ role }: { role: Role }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Acting as
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900"
        value={role}
        disabled={pending}
        onChange={(e) => start(() => setRole(e.target.value as Role))}
      >
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
    </label>
  );
}
