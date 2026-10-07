"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { canManageOrganization } from "@/lib/domain/access";
import { cargaMetas, CargaError } from "@/lib/seed/metas";

/**
 * Executa a carga de funções, indicadores e metas da equipe (src/lib/seed/metas.ts).
 * O botão "simular" roda tudo e desfaz no final; o botão "aplicar" grava.
 * A mensagem devolvida é o relatório completo, uma linha por item.
 */
export const runCargaMetas = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  if (!canManageOrganization(access.ctx)) throw new AuthorizationError("Somente o administrador pode fazer isso.");

  const aplicar = fd.get("modo") === "aplicar";
  const limparDemo = fd.get("limparDemo") === "on";
  const linhas: string[] = [];
  try {
    const r = await cargaMetas(prisma, { aplicar, limparDemo, log: (m) => linhas.push(m) });
    linhas.push("", "Resumo:");
    for (const [k, v] of Object.entries(r.contagem)) linhas.push(`  ${k}: ${v}`);
    if (r.avisos.length) {
      linhas.push("", "Avisos:");
      for (const a of r.avisos) linhas.push(`  - ${a}`);
    }
    linhas.push("", r.aplicado ? "CARGA GRAVADA." : "SIMULAÇÃO: nada foi gravado. Se o relatório estiver certo, use o botão Aplicar.");
  } catch (e) {
    if (e instanceof CargaError) throw new UserFacingError(`A carga não foi feita e nada foi gravado. ${e.message}`);
    throw e;
  }
  if (aplicar) revalidatePath("/", "layout");
  return { ok: true, message: linhas.join("\n") };
});
