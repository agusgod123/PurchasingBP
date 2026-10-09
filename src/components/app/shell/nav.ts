import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Cog,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderArchive,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Mail,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Tampil jika pengguna punya salah satu izin; kosong = semua pengguna. */
  anyOf?: PermissionCode[];
  badgeKey?: "tasks" | "approvals" | "queue";
  exact?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const P = PERMISSIONS;

export const NAV: NavSection[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Pusat Tugas", href: "/tugas", icon: ListTodo, badgeKey: "tasks" },
    ],
  },
  {
    label: "Pengajuan",
    items: [
      { title: "Buat Pengajuan", href: "/pengajuan/baru", icon: FilePlus2, anyOf: [P.REQUEST_CREATE], exact: true },
      { title: "Pengajuan Saya", href: "/pengajuan", icon: FileText, anyOf: [P.REQUEST_CREATE], exact: true },
      { title: "Semua Pengajuan", href: "/pengajuan/semua", icon: ClipboardList, anyOf: [P.REQUEST_VIEW_SUMMARY_ALL] },
      { title: "Persetujuan", href: "/persetujuan", icon: ClipboardCheck, badgeKey: "approvals" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { title: "Antrean", href: "/purchasing/antrean", icon: Inbox, anyOf: [P.PURCHASING_MANAGE], badgeKey: "queue" },
      { title: "Pesanan (PO)", href: "/purchasing/po", icon: ShoppingCart, anyOf: [P.PURCHASING_MANAGE] },
      { title: "Vendor", href: "/purchasing/vendor", icon: Store, anyOf: [P.VENDOR_MANAGE] },
      { title: "Arsip Dokumen", href: "/arsip", icon: FolderArchive, anyOf: [P.DOCUMENT_VIEW_ALL] },
    ],
  },
  {
    label: "Laporan",
    items: [{ title: "Laporan", href: "/laporan", icon: BarChart3, anyOf: [P.REPORT_VIEW_ALL, P.REPORT_VIEW_DEPARTMENT] }],
  },
  {
    label: "Administrasi",
    items: [
      { title: "Pengguna", href: "/admin/pengguna", icon: Users, anyOf: [P.USER_MANAGE] },
      { title: "Bagian & Pegawai", href: "/admin/organisasi", icon: Building2, anyOf: [P.ORG_MANAGE] },
      { title: "Peran & Izin", href: "/admin/peran", icon: ShieldCheck, anyOf: [P.ROLE_MANAGE] },
      { title: "Matriks Persetujuan", href: "/admin/persetujuan", icon: GitBranch, anyOf: [P.APPROVAL_RULE_MANAGE] },
      { title: "Dokumen Wajib", href: "/admin/dokumen-wajib", icon: FileCheck2, anyOf: [P.SETTINGS_MANAGE] },
      { title: "Katalog Barang", href: "/admin/katalog", icon: Package, anyOf: [P.CATALOG_MANAGE] },
      { title: "Anggaran", href: "/admin/anggaran", icon: Wallet, anyOf: [P.BUDGET_MANAGE] },
      { title: "Hari Libur", href: "/admin/hari-libur", icon: CalendarOff, anyOf: [P.SETTINGS_MANAGE] },
      { title: "Pengaturan", href: "/admin/pengaturan", icon: Cog, anyOf: [P.SETTINGS_MANAGE] },
      { title: "Email Keluar", href: "/admin/email", icon: Mail, anyOf: [P.SETTINGS_MANAGE] },
      { title: "Audit Log", href: "/admin/audit", icon: ScrollText, anyOf: [P.AUDIT_VIEW] },
    ],
  },
  {
    label: "Bantuan",
    items: [
      { title: "FAQ & Panduan", href: "/bantuan", icon: BookOpen, exact: true },
      { title: "Tiket Bantuan", href: "/bantuan/tiket", icon: LifeBuoy },
    ],
  },
];

export function visibleNav(permissions: string[]): NavSection[] {
  const set = new Set(permissions);
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.anyOf || i.anyOf.some((p) => set.has(p))) })).filter(
    (s) => s.items.length > 0,
  );
}
