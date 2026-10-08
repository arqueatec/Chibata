import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asanaEnabled, syncAsana } from "@/lib/asana/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Sincronização diária com o Asana (Vercel Cron). */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!(await asanaEnabled())) return NextResponse.json({ skipped: "integração com o Asana não configurada" });
  const r = await syncAsana({ actorId: null, trigger: "cron" });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
