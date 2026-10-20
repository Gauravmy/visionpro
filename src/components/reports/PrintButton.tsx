"use client";

import { Printer } from "lucide-react";
import { Button } from "../ui/primitives";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button variant="primary" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden className="h-4 w-4" /> {label}
    </Button>
  );
}
