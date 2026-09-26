import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthorizationError } from "@/lib/authz";
import "@/lib/validation";

export type ActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;

export class UserFacingError extends Error {}

/** Envolve uma server action com tratamento de erros padronizado e mensagens em português. */
export function safeAction<T extends unknown[]>(fn: (...args: T) => Promise<ActionResult | void>) {
  return async (...args: T): Promise<ActionResult> => {
    try {
      return (await fn(...args)) ?? { ok: true, message: "Salvo com sucesso." };
    } catch (e) {
      // redirect() / notFound() do Next usam exceções — precisam ser repassadas
      if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
      if (e instanceof AuthorizationError || e instanceof UserFacingError) return { ok: false, message: e.message };
      if (e instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
        return { ok: false, message: e.issues[0]?.message ?? "Dados inválidos.", fieldErrors };
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") return { ok: false, message: "Já existe um registro com esses dados." };
        if (e.code === "P2025") return { ok: false, message: "Registro não encontrado." };
      }
      console.error("[action] erro inesperado", e);
      return { ok: false, message: "Ocorreu um erro inesperado. Tente novamente." };
    }
  };
}

/** Converte FormData em objeto simples (checkbox "on" -> true). Campos repetidos viram arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v.name;
    if (k in obj) {
      const cur = obj[k];
      obj[k] = Array.isArray(cur) ? [...cur, value] : [cur, value];
    } else obj[k] = value;
  }
  return obj;
}
