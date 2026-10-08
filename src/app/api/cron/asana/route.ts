import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asanaEnabled, syncAsana } from "@/lib/asana/sync";
import { crmConfigured } from "@/lib/crm/client";
import { syncCrm } from "@/lib/crm/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Sincronização diária das integrações (Vercel Cron): Asana e CRM NoFire. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const crm = crmConfigured() ? await syncCrm({ actorId: null, trigger: "cron" }) : { skipped: "CRM não configurado" };
  const asana = (await asanaEnabled()) ? await syncAsana({ actorId: null, trigger: "cron" }) : { skipped: "Asana não configurado" };
  const failed = ("ok" in crm && !crm.ok) || ("ok" in asana && !asana.ok);
  return NextResponse.json({ crm, asana }, { status: failed ? 500 : 200 });
}
