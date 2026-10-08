import type { Access } from "@/lib/authz";

/** O painel Comercial (dados do CRM) fica disponível para o administrador e para quem tem conta vinculada no CRM. */
export function canSeeCommercial(a: Pick<Access, "isAdmin"> & { user: { crmEmails: string[] } }) {
  return a.isAdmin || a.user.crmEmails.length > 0;
}
