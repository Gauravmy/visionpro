import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InspectionDetail } from "@/components/inspection/InspectionDetail";
import { getInspection } from "@/lib/db/inspections";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
}

export default async function InspectionDetailPage({ params }: Props) {
  const { id } = await params;
  const found = getInspection(decodeURIComponent(id));
  if (!found) notFound();
  return <InspectionDetail record={found.record} />;
}
