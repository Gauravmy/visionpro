import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProfileEditor } from "@/components/products/ProfileEditor";
import { ButtonLink, Panel, PanelHeader, Tag, cn } from "@/components/ui/primitives";
import { getDb } from "@/lib/db";
import { listProfiles } from "@/lib/db/profiles";
import { getSettings } from "@/lib/db/settings";

export const metadata: Metadata = { title: "Product profiles" };
export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const profiles = listProfiles();
  const settings = getSettings();
  const counts = new Map(
    (getDb().prepare("SELECT profile_id AS id, COUNT(*) AS n FROM inspections GROUP BY profile_id").all() as Array<{ id: string; n: number }>).map((r) => [r.id, r.n]),
  );
  const selectedId = id === "new" ? "new" : profiles.some((p) => p.id === id) ? id! : (settings.activeProfileId ?? profiles[0]?.id ?? "new");

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="self-start">
        <PanelHeader
          title="Profiles"
          description={`${profiles.length} configured`}
          actions={
            <ButtonLink href="/products?id=new" size="sm" variant="primary">
              <Plus aria-hidden className="h-3.5 w-3.5" /> New
            </ButtonLink>
          }
        />
        <ul className="p-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products?id=${p.id}`}
                aria-current={selectedId === p.id ? "true" : undefined}
                className={cn("block rounded-md px-3 py-2.5 transition-colors", selectedId === p.id ? "bg-raised" : "hover:bg-raised/60")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{p.name}</span>
                  {p.id === settings.activeProfileId ? <Tag tone="info">Active</Tag> : null}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-subtle">{p.code}</span>
                <span className="mt-1 block text-xs text-muted">
                  {p.classes.filter((c) => c.enabled).length}/{p.classes.length} classes · {counts.get(p.id) ?? 0} inspections
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <ProfileEditor profiles={profiles} selectedId={selectedId} activeProfileId={settings.activeProfileId} />
    </div>
  );
}
