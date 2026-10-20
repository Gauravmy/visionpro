"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Printer, ScanSearch, Trash2 } from "lucide-react";
import type { InspectionRecord } from "@/lib/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button, ButtonLink, Notice, PageIntro, Panel, buttonClass } from "../ui/primitives";
import { ImageViewer } from "./ImageViewer";
import { Legend, ResultPanel } from "./ResultPanel";

export function InspectionDetail({ record }: { record: InspectionRecord }) {
  const router = useRouter();
  const [highlight, setHighlight] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const classOrder = record.profileSnapshot.classes.map((c) => c.key);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/inspections/${encodeURIComponent(record.id)}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setConfirm(false);
      router.push("/history");
      router.refresh();
    } else {
      setConfirm(false);
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "The record could not be deleted.");
    }
  };

  return (
    <>
      <PageIntro
        actions={
          <>
            <a href={`/api/export?format=json&ids=${record.id}`} className={buttonClass("ghost", "sm")}>
              <Download aria-hidden className="h-4 w-4" /> JSON
            </a>
            <a href={`/api/export?format=csv&ids=${record.id}`} className={buttonClass("ghost", "sm")}>
              <Download aria-hidden className="h-4 w-4" /> CSV
            </a>
            <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden className="h-4 w-4" /> Delete
            </Button>
            <ButtonLink href={`/inspection/${record.id}/report`} size="sm">
              <Printer aria-hidden className="h-4 w-4" /> Report
            </ButtonLink>
            <ButtonLink href="/inspection" size="sm" variant="primary">
              <ScanSearch aria-hidden className="h-4 w-4" /> New inspection
            </ButtonLink>
          </>
        }
      />
      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <ImageViewer
            src={record.imageAvailable ? `/api/inspections/${record.id}/image` : null}
            detections={record.detections}
            classOrder={classOrder}
            highlight={highlight}
            emptyLabel="The image for this inspection was not retained (see Settings → Image retention). Detection data is still available."
          />
          <div className="mt-2 px-1">
            <Legend record={record} classOrder={classOrder} />
          </div>
        </div>
        <Panel className="self-start">
          <ResultPanel record={record} onHighlight={setHighlight} />
        </Panel>
      </div>
      <ConfirmDialog open={confirm} title={`Delete ${record.id}?`} confirmLabel="Delete record" busy={deleting} onCancel={() => setConfirm(false)} onConfirm={remove}>
        The inspection record, its detections and its stored image will be permanently removed. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
