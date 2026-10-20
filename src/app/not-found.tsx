import { FileQuestion } from "lucide-react";
import { ButtonLink, EmptyState, Panel } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <Panel>
      <EmptyState icon={FileQuestion} title="Page or record not found" action={<ButtonLink href="/dashboard">Go to dashboard</ButtonLink>}>
        The address may be mistyped, or the inspection record may have been deleted.
      </EmptyState>
    </Panel>
  );
}
