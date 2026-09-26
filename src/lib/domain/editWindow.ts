import { businessDaysAfter, type DayKey } from "./dates";

/** Quantos dias úteis após a data o colaborador ainda pode registrar/editar o check-in. */
export const EDIT_WINDOW_BUSINESS_DAYS = 2;

export type EditDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Regra de bloqueio de edição de check-ins e lançamentos de indicadores.
 * - Datas futuras nunca podem ser registradas.
 * - Colaboradores: até EDIT_WINDOW_BUSINESS_DAYS dias úteis de atraso.
 * - Administrador: pode editar qualquer data passada.
 */
export function checkInEditDecision(params: { date: DayKey; today: DayKey; isAdmin: boolean }): EditDecision {
  const { date, today, isAdmin } = params;
  if (date > today) return { allowed: false, reason: "Não é possível registrar check-ins para datas futuras." };
  if (isAdmin) return { allowed: true };
  const late = businessDaysAfter(date, today);
  if (late > EDIT_WINDOW_BUSINESS_DAYS) {
    return {
      allowed: false,
      reason: `O prazo para registrar ou editar este dia terminou (limite de ${EDIT_WINDOW_BUSINESS_DAYS} dias úteis). Peça ao administrador.`,
    };
  }
  return { allowed: true };
}
