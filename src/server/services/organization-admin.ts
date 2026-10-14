import "server-only";
import { db } from "@/lib/db";
import { storage } from "../storage";

/**
 * Suppression DÉFINITIVE d'une organisation et de toutes ses données (fermeture de compte,
 * effacement, réinitialisation de la démo). Irréversible : réservée aux scripts d'administration,
 * jamais exposée par l'API. Lève temporairement la protection « ajout seul » via un paramètre
 * de transaction (SET LOCAL eventflow.allow_purge).
 */
export async function purgeOrganization(organizationId: string) {
  const docs = await db.document.findMany({ where: { organizationId }, select: { storageKey: true } });
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL eventflow.allow_purge = 'on'`);
      const o = { organizationId };
      await tx.payment.deleteMany({ where: o });
      await tx.invoice.deleteMany({ where: { ...o, kind: "CREDIT_NOTE" } });
      await tx.invoice.deleteMany({ where: o });
      await tx.goodsReceiptLine.deleteMany({ where: { receipt: o } });
      await tx.goodsReceipt.deleteMany({ where: o });
      await tx.purchaseOrder.deleteMany({ where: o });
      await tx.quote.deleteMany({ where: o });
      await tx.opportunity.deleteMany({ where: o });
      await tx.returnInspection.deleteMany({ where: o });
      await tx.stockMovement.deleteMany({ where: { ...o, reversesId: { not: null } } });
      await tx.stockMovement.deleteMany({ where: o });
      await tx.reservation.deleteMany({ where: o });
      await tx.stockBalance.deleteMany({ where: o });
      await tx.equipmentAsset.deleteMany({ where: o });
      await tx.maintenanceTicket.deleteMany({ where: o });
      await tx.timesheet.deleteMany({ where: o });
      await tx.eventStaffAssignment.deleteMany({ where: o });
      await tx.vehicleAssignment.deleteMany({ where: o });
      await tx.staffAvailability.deleteMany({ where: o });
      await tx.expense.deleteMany({ where: o });
      await tx.eventTask.deleteMany({ where: o });
      await tx.eventNote.deleteMany({ where: o });
      await tx.equipmentProduct.updateMany({ where: o, data: { photoDocumentId: null, defaultLocationId: null } });
      await tx.document.deleteMany({ where: o });
      await tx.event.deleteMany({ where: o });
      await tx.eventType.deleteMany({ where: o });
      await tx.equipmentProduct.deleteMany({ where: o });
      await tx.equipmentCategory.deleteMany({ where: o });
      await tx.stockLocation.updateMany({ where: o, data: { parentId: null } });
      await tx.stockLocation.deleteMany({ where: o });
      await tx.vehicleMaintenance.deleteMany({ where: o });
      await tx.vehicle.deleteMany({ where: o });
      await tx.staffMember.deleteMany({ where: o });
      await tx.skill.deleteMany({ where: o });
      await tx.customer.deleteMany({ where: o });
      await tx.supplier.deleteMany({ where: o });
      await tx.organization.delete({ where: { id: organizationId } });
    },
    { timeout: 120_000 },
  );
  for (const d of docs) await storage().delete(d.storageKey).catch(() => undefined);
}
