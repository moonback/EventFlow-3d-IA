import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { deliverNotificationEmails, runAlertScan } from "@/server/services/notification-service";

/**
 * Tâche planifiée (cron externe, ex. toutes les heures) protégée par CRON_SECRET :
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/jobs/alerts
 */
export async function POST(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Non autorisé" } }, { status: 401 });
  }
  const orgs = await db.organization.findMany({ select: { id: true } });
  let created = 0;
  let emails = 0;
  for (const o of orgs) {
    created += (await runAlertScan(o.id)).created;
    emails += (await deliverNotificationEmails(o.id)).sent;
  }
  return NextResponse.json({ data: { organizations: orgs.length, notifications: created, emails } });
}
