import {
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Home,
  Inbox,
  Box,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  UserSquare2,
  Warehouse,
  Wrench,
  Wallet,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  shortcut?: string;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/dashboard", label: "Accueil", icon: Home, permission: "dashboard:read", shortcut: "d" },
      { href: "/world", label: "Mon univers 3D", icon: Box, permission: "dashboard:read", shortcut: "w" },
      { href: "/planning", label: "Planning", icon: CalendarDays, permission: "events:read", shortcut: "p" },
    ],
  },
  {
    title: "Commercial",
    items: [
      { href: "/opportunities", label: "Demandes", icon: Inbox, permission: "quotes:read" },
      { href: "/customers", label: "Clients", icon: Building2, permission: "customers:read", shortcut: "c" },
      { href: "/events", label: "Événements", icon: PartyPopper, permission: "events:read", shortcut: "e" },
      { href: "/quotes", label: "Devis", icon: FileText, permission: "quotes:read", shortcut: "q" },
      { href: "/invoices", label: "Factures", icon: Receipt, permission: "invoices:read", shortcut: "f" },
    ],
  },
  {
    title: "Opérations",
    items: [
      { href: "/inventory", label: "Catalogue & stock", icon: Boxes, permission: "inventory:read", shortcut: "i" },
      { href: "/warehouse", label: "Entrepôt", icon: Warehouse, permission: "stock:read" },
      { href: "/reservations", label: "Réservations", icon: PackageSearch, permission: "reservations:read", shortcut: "r" },
      { href: "/logistics", label: "Logistique", icon: ClipboardList, permission: "reservations:read", shortcut: "l" },
      { href: "/maintenance", label: "Maintenance", icon: Wrench, permission: "stock:read" },
      { href: "/vehicles", label: "Véhicules", icon: Truck, permission: "vehicles:read", shortcut: "v" },
      { href: "/team", label: "Équipe", icon: Users, permission: "staff:read", shortcut: "t" },
    ],
  },
  {
    title: "Gestion",
    items: [
      { href: "/suppliers", label: "Fournisseurs", icon: UserSquare2, permission: "suppliers:read" },
      { href: "/purchases", label: "Achats", icon: ShoppingCart, permission: "purchases:read" },
      { href: "/finance", label: "Finances", icon: Wallet, permission: "finance:read" },
      { href: "/reports", label: "Rapports", icon: BarChart3, permission: "reports:read" },
      { href: "/documents", label: "Documents", icon: FolderOpen, permission: "documents:read" },
      { href: "/imports", label: "Imports CSV", icon: FileSpreadsheet, permission: "import:run" },
      { href: "/settings", label: "Paramètres", icon: Settings, permission: "dashboard:read" },
    ],
  },
];
