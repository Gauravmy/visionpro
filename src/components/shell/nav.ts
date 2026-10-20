import {
  BarChart3,
  Boxes,
  Cpu,
  FileText,
  History,
  LayoutDashboard,
  ScanSearch,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Short label for the top bar. */
  label: string;
  /** Full page title. */
  title: string;
  /** One line shown under the page title and in the command palette. */
  blurb: string;
  icon: LucideIcon;
  /** Single-key shortcut after pressing G (e.g. G then D). */
  key: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", title: "Dashboard", blurb: "Line output and station health at a glance", icon: LayoutDashboard, key: "d" },
  { href: "/inspection", label: "Inspect", title: "New inspection", blurb: "Load a part image and get a decision", icon: ScanSearch, key: "i" },
  { href: "/history", label: "History", title: "Inspection history", blurb: "Search, filter and export stored records", icon: History, key: "h" },
  { href: "/analytics", label: "Analytics", title: "Analytics", blurb: "Trends by decision and defect class", icon: BarChart3, key: "a" },
  { href: "/models", label: "Models", title: "Models & performance", blurb: "Live detector status and research results", icon: Cpu, key: "m" },
  { href: "/products", label: "Profiles", title: "Product profiles", blurb: "Classes, thresholds and quality rules", icon: Boxes, key: "p" },
  { href: "/reports", label: "Reports", title: "Reports", blurb: "Printable summaries for a date range", icon: FileText, key: "r" },
  { href: "/settings", label: "Settings", title: "Settings", blurb: "Retention, exports and defaults", icon: Settings, key: "s" },
];

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumbs derived from the path. Inspection detail pages sit under History. */
export function crumbsFor(pathname: string): { title: string; crumbs: Crumb[] } {
  const detail = pathname.match(/^\/inspection\/([^/]+)(\/report)?$/);
  if (detail) {
    const id = decodeURIComponent(detail[1]);
    const crumbs: Crumb[] = [{ label: "History", href: "/history" }, { label: id, href: detail[2] ? `/inspection/${detail[1]}` : undefined }];
    if (detail[2]) crumbs.push({ label: "Report" });
    return { title: detail[2] ? "Inspection report" : "Inspection detail", crumbs };
  }
  const item = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item ? { title: item.title, crumbs: [{ label: item.label }] } : { title: "VisionInspect Pro", crumbs: [] };
}

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => pathname === n.href);
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/inspection") return pathname === "/inspection";
  if (href === "/history") return pathname === "/history" || /^\/inspection\/.+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}
