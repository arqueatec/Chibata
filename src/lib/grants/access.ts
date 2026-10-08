import type { Access } from "@/lib/authz";
import { AuthorizationError } from "@/lib/authz";

/** O módulo Editais fica disponível para o administrador e para quem está na equipe de editais. */
export function canSeeGrants(a: Pick<Access, "isAdmin"> & { user: { grantsTeam: boolean } }) {
  return a.isAdmin || a.user.grantsTeam;
}

export function assertCanSeeGrants(a: Access) {
  if (!canSeeGrants(a)) throw new AuthorizationError("Você não faz parte da equipe de editais.");
}
