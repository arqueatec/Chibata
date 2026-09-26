import { z } from "zod";
import { pt } from "zod/v4/locales";

// Mensagens de validação padrão em português
z.config(pt());
import { isDayKey } from "@/lib/domain/dates";

export const dayKey = z.string().refine(isDayKey, { message: "Data inválida." });
export const optionalDayKey = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isDayKey(v), { message: "Data inválida." });
export const trimmed = (max: number, label: string) =>
  z.string().trim().max(max, { message: `${label}: máximo de ${max} caracteres.` });
export const requiredText = (max: number, label: string) =>
  trimmed(max, label).min(1, { message: `${label} é obrigatório.` });
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(max, { message: `${label}: máximo de ${max} caracteres.` }))
    .transform((v) => (v === "" ? null : v));
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
export const numberField = (label: string, opts: { min?: number; max?: number } = {}) =>
  z
    .string()
    .transform((v) => v.replace(/\s/g, "").replace(",", "."))
    .pipe(
      z
        .string()
        .min(1, { message: `${label} é obrigatório.` })
        .transform((v) => Number(v))
        .pipe(z.number({ message: `${label}: número inválido.` }))
        .refine((n) => Number.isFinite(n), { message: `${label}: número inválido.` })
        .refine((n) => opts.min === undefined || n >= opts.min, { message: `${label}: mínimo ${opts.min}.` })
        .refine((n) => opts.max === undefined || n <= opts.max, { message: `${label}: máximo ${opts.max}.` }),
    );
export const idField = z.string().min(1).max(64);
export const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
