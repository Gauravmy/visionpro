"use client";

import { AlertOctagon } from "lucide-react";
import { Button, EmptyState, Panel } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel>
      <EmptyState icon={AlertOctagon} title="This page failed to load" action={<Button onClick={reset}>Try again</Button>}>
        A server error occurred while loading data{error.digest ? ` (reference ${error.digest})` : ""}. Check the web server log; if
        the database file is locked or missing, restart the server.
      </EmptyState>
    </Panel>
  );
}
