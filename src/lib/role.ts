import { cookies } from "next/headers";
import { ROLES, type Role } from "./workflow";

export async function getRole(): Promise<Role> {
  const value = (await cookies()).get("role")?.value;
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "Paralegal";
}
