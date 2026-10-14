/** Libellés français des énumérations métier (partagés client/serveur). */
import type {
  AssetStatus,
  AssignmentStatus,
  CustomerKind,
  DocumentCategory,
  EmploymentType,
  EventStatus,
  ExpenseCategory,
  InvoiceStatus,
  LineKind,
  LocationKind,
  MaintenanceStatus,
  MovementType,
  NotificationType,
  OpportunitySource,
  OpportunityStage,
  PaymentMethod,
  PurchaseOrderStatus,
  QuoteStatus,
  ReservationStatus,
  Role,
  StaffAvailabilityKind,
  TaskPriority,
  TaskStatus,
  VehicleStatus,
  VehicleType,
} from "@prisma/client";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export const roleLabels: Record<Role, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  DIRECTOR: "Direction",
  LOGISTICS_MANAGER: "Responsable logistique",
  STOCK_MANAGER: "Gestionnaire de stock",
  SALES: "Commercial",
  ACCOUNTING: "Comptabilité",
  TECHNICIAN: "Technicien",
  DRIVER: "Chauffeur",
  CREW: "Équipe / intermittent",
  READ_ONLY: "Lecture seule",
};

export const customerKindLabels: Record<CustomerKind, string> = {
  INDIVIDUAL: "Particulier",
  COMPANY: "Entreprise",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Brouillon",
  QUOTED: "Devis envoyé",
  CONFIRMED: "Confirmé",
  IN_PREPARATION: "En préparation",
  READY: "Prêt à partir",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};
export const eventStatusTones: Record<EventStatus, Tone> = {
  DRAFT: "neutral",
  QUOTED: "info",
  CONFIRMED: "accent",
  IN_PREPARATION: "warning",
  READY: "success",
  IN_PROGRESS: "info",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  IN_PREPARATION: "En préparation",
  PREPARED: "Préparée",
  SHIPPED: "Expédiée",
  PARTIALLY_RETURNED: "Partiellement retournée",
  RETURNED: "Retournée",
  CANCELLED: "Annulée",
};
export const reservationStatusTones: Record<ReservationStatus, Tone> = {
  DRAFT: "neutral",
  PENDING: "info",
  CONFIRMED: "accent",
  IN_PREPARATION: "warning",
  PREPARED: "success",
  SHIPPED: "info",
  PARTIALLY_RETURNED: "warning",
  RETURNED: "neutral",
  CANCELLED: "danger",
};

export const locationKindLabels: Record<LocationKind, string> = {
  WAREHOUSE: "Entrepôt",
  ZONE: "Zone",
  RACK: "Rayonnage",
  BIN: "Emplacement",
  PREPARATION: "Zone de préparation",
  RETURN: "Zone de retour",
  QUARANTINE: "Quarantaine (endommagé)",
  MAINTENANCE: "Atelier maintenance",
  OUT: "Sorti (transit / sur site)",
};

export const movementTypeLabels: Record<MovementType, string> = {
  RECEIPT: "Réception fournisseur",
  TRANSFER: "Transfert",
  PREPARATION: "Préparation",
  UNPREPARE: "Remise en rayon",
  SHIPMENT: "Expédition",
  RETURN: "Retour",
  RETURN_DAMAGED: "Retour endommagé",
  MAINTENANCE_IN: "Mise en maintenance",
  MAINTENANCE_OUT: "Sortie de maintenance",
  LOSS: "Perte / mise au rebut",
  ADJUSTMENT_IN: "Ajustement inventaire (+)",
  ADJUSTMENT_OUT: "Ajustement inventaire (−)",
  REVERSAL: "Mouvement compensatoire",
};

export const assetStatusLabels: Record<AssetStatus, string> = {
  AVAILABLE: "Disponible",
  OUT: "Sorti",
  DAMAGED: "Endommagé",
  MAINTENANCE: "En maintenance",
  LOST: "Perdu",
  RETIRED: "Réformé",
};

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  OPEN: "Ouvert",
  IN_PROGRESS: "En réparation",
  RESOLVED: "Résolu",
  SCRAPPED: "Mis au rebut",
};
export const maintenanceStatusTones: Record<MaintenanceStatus, Tone> = {
  OPEN: "danger",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  SCRAPPED: "neutral",
};

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  AVAILABLE: "En service",
  MAINTENANCE: "En maintenance",
  UNAVAILABLE: "Indisponible",
  RETIRED: "Retiré du parc",
};

/** Statut opérationnel calculé (affectations + statut administratif) */
export type VehicleOpsStatus = "AVAILABLE" | "ASSIGNED" | "ON_MISSION" | "MAINTENANCE" | "UNAVAILABLE";
export const vehicleOpsStatusLabels: Record<VehicleOpsStatus, string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Affecté",
  ON_MISSION: "En mission",
  MAINTENANCE: "En maintenance",
  UNAVAILABLE: "Indisponible",
};
export const vehicleOpsStatusTones: Record<VehicleOpsStatus, Tone> = {
  AVAILABLE: "success",
  ASSIGNED: "accent",
  ON_MISSION: "info",
  MAINTENANCE: "warning",
  UNAVAILABLE: "danger",
};

export const vehicleTypeLabels: Record<VehicleType, string> = {
  VAN: "Utilitaire",
  TRUCK_LIGHT: "Porteur léger",
  TRUCK_HEAVY: "Poids lourd",
  TRAILER: "Remorque",
  CAR: "Véhicule léger",
};

export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  PROPOSED: "Proposée",
  PLANNED: "Planifiée",
  CONFIRMED: "Confirmée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  DECLINED: "Refusée",
  CANCELLED: "Annulée",
};

export const availabilityKindLabels: Record<StaffAvailabilityKind, string> = {
  UNAVAILABLE: "Indisponible",
  AVAILABLE: "Disponible",
};

export const employmentTypeLabels: Record<EmploymentType, string> = {
  EMPLOYEE: "Salarié",
  FREELANCE: "Indépendant",
  INTERMITTENT: "Intermittent",
  TEMP: "Intérimaire",
};

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  DECLINED: "Refusé",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
};
export const quoteStatusTones: Record<QuoteStatus, Tone> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CANCELLED: "neutral",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: "Brouillon",
  ISSUED: "Émise",
  PARTIALLY_PAID: "Partiellement payée",
  PAID: "Payée",
  CANCELLED: "Annulée (avoir)",
};
export const invoiceStatusTones: Record<InvoiceStatus, Tone> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

export const lineKindLabels: Record<LineKind, string> = {
  EQUIPMENT: "Matériel",
  LABOR: "Main-d'œuvre",
  TRANSPORT: "Transport",
  SERVICE: "Prestation",
  OTHER: "Autre",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Virement",
  CARD: "Carte bancaire",
  CHECK: "Chèque",
  CASH: "Espèces",
  OTHER: "Autre",
};

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  EQUIPMENT_RENTAL: "Location de matériel",
  PURCHASE: "Achat",
  TRANSPORT: "Transport",
  FUEL: "Carburant / péages",
  LABOR: "Main-d'œuvre externe",
  SUBCONTRACTING: "Sous-traitance",
  CATERING: "Restauration",
  VENUE: "Lieu",
  MAINTENANCE: "Entretien / réparation",
  INSURANCE: "Assurance",
  OTHER: "Autre",
};

export const purchaseOrderStatusLabels: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Brouillon",
  ORDERED: "Commandée",
  PARTIALLY_RECEIVED: "Partiellement reçue",
  RECEIVED: "Reçue",
  CANCELLED: "Annulée",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
  CANCELLED: "Annulée",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  LOW: "Basse",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};

export const documentCategoryLabels: Record<DocumentCategory, string> = {
  CONTRACT: "Contrat",
  QUOTE: "Devis",
  INVOICE: "Facture",
  PHOTO: "Photo",
  PLAN: "Plan",
  TECHNICAL: "Fiche technique",
  VEHICLE: "Document véhicule",
  STAFF: "Document collaborateur",
  OTHER: "Autre",
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  RESERVATION_CONFIRMED: "Réservation confirmée",
  STOCK_INSUFFICIENT: "Stock insuffisant",
  PREPARATION_INCOMPLETE: "Préparation incomplète",
  DEPARTURE_SOON: "Départ imminent",
  RETURN_LATE: "Retour en retard",
  EQUIPMENT_DAMAGED: "Matériel endommagé",
  MAINTENANCE_DUE: "Entretien à effectuer",
  QUOTE_FOLLOW_UP: "Devis à relancer",
  INVOICE_OVERDUE: "Facture en retard",
  TASK_OVERDUE: "Tâche en retard",
  LOW_STOCK: "Seuil de stock atteint",
  STAFF_MISSION_RESPONSE: "Réponse à une proposition de mission",
  QUOTE_REQUEST: "Nouvelle demande de devis",
  GENERAL: "Information",
};

export const opportunityStageLabels: Record<OpportunityStage, string> = {
  NEW: "Demande",
  QUALIFIED: "Qualifiée",
  QUOTE_SENT: "Devis envoyé",
  WON: "Gagnée",
  LOST: "Perdue",
};

export const opportunityStageTones: Record<OpportunityStage, Tone> = {
  NEW: "info",
  QUALIFIED: "accent",
  QUOTE_SENT: "warning",
  WON: "success",
  LOST: "neutral",
};

export const opportunitySourceLabels: Record<OpportunitySource, string> = {
  MANUAL: "Saisie manuelle",
  PUBLIC_FORM: "Formulaire public",
};
