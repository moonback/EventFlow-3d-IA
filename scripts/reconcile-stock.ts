/**
 * Contrôle de cohérence : recalcule les soldes de stock à partir du journal des mouvements
 * et signale tout écart (code de sortie 1 si écart). Lecture seule.
 *   npm run stock:reconcile
 */
import { db } from "../src/lib/db";
import { reconcileBalances } from "../src/server/services/stock-movement-service";

async function main() {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  let issues = 0;
  for (const o of orgs) {
    const diff = await reconcileBalances(o.id);
    issues += diff.length;
    console.log(`${o.name} : ${diff.length === 0 ? "OK" : `${diff.length} écart(s)`}`);
    for (const d of diff) console.log(`  produit ${d.productId} @ ${d.locationId} : journal ${d.journal} ≠ solde ${d.balance}`);
  }
  if (issues > 0) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
