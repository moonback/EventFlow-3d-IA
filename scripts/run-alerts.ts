/**
 * Analyse des alertes pour toutes les organisations (à planifier, ex. toutes les heures) :
 *   npm run jobs:alerts
 * Équivalent HTTP : POST /api/jobs/alerts avec l'en-tête Authorization: Bearer $CRON_SECRET.
 */
import { db } from "../src/lib/db";
import { deliverNotificationEmails, runAlertScan } from "../src/server/services/notification-service";

async function main() {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  for (const o of orgs) {
    const { created } = await runAlertScan(o.id);
    const mail = await deliverNotificationEmails(o.id);
    console.log(`${o.name} : ${created} notification(s), ${mail.sent} e-mail(s) remis, ${mail.failed} échec(s)`);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
