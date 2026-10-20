// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultSteelProfile } from "@/lib/profiles/defaults";
import type { InspectionRecord } from "@/lib/types";
import { BackendStatusProvider } from "../shell/BackendStatus";
import { InspectionWorkspace } from "./InspectionWorkspace";
import { ResultPanel } from "./ResultPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const profile = defaultSteelProfile("2026-01-01T00:00:00Z");

beforeAll(() => {
  // jsdom lacks these browser APIs.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  globalThis.URL.revokeObjectURL = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ reachable: false, checkedAt: new Date().toISOString(), message: "offline", endpoint: "x" }))),
  );
});

afterEach(cleanup);

function renderWorkspace() {
  return render(
    <BackendStatusProvider>
      <InspectionWorkspace profiles={[profile]} activeProfileId={profile.id} initialSource="upload" />
    </BackendStatusProvider>,
  );
}

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("InspectionWorkspace", () => {
  it("keeps Run disabled until a valid image is chosen", async () => {
    renderWorkspace();
    expect(screen.getByRole("button", { name: /run inspection/i })).toBeDisabled();
    const input = document.getElementById("ws-file") as HTMLInputElement;
    await userEvent.upload(input, new File([pngBytes], "part.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /run inspection/i })).toBeEnabled());
    expect(screen.getByText("part.png")).toBeInTheDocument();
  });

  it("rejects a file whose contents are not an image", async () => {
    renderWorkspace();
    const input = document.getElementById("ws-file") as HTMLInputElement;
    await userEvent.upload(input, new File(["not an image"], "fake.png", { type: "image/png" }));
    expect(await screen.findByText(/not a JPEG, PNG or WebP image/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run inspection/i })).toBeDisabled();
  });

  it("clears the selected image", async () => {
    renderWorkspace();
    const input = document.getElementById("ws-file") as HTMLInputElement;
    await userEvent.upload(input, new File([pngBytes], "part.png", { type: "image/png" }));
    await userEvent.click(await screen.findByRole("button", { name: /clear image/i }));
    expect(screen.queryByText("part.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run inspection/i })).toBeDisabled();
  });

  it("shows the backend as offline and warns that results will be REVIEW", async () => {
    renderWorkspace();
    expect(await screen.findByText(/inference service offline/i)).toBeInTheDocument();
    expect(screen.getByText(/results will be REVIEW/i)).toBeInTheDocument();
  });
});

function record(partial: Partial<InspectionRecord>): InspectionRecord {
  return {
    id: "INS-20260101-ABCDEF",
    createdAt: "2026-01-01T10:00:00.000Z",
    profileId: profile.id,
    profileName: profile.name,
    profileSnapshot: profile,
    decision: "REVIEW",
    defectCount: 0,
    source: "upload",
    originalFilename: "a.png",
    imageAvailable: true,
    imageMime: "image/png",
    imageWidth: 100,
    imageHeight: 100,
    imageBytes: 1000,
    modelId: null,
    modelVersion: null,
    detectorStatus: "unavailable",
    quality: { status: "unavailable", message: "Inference service is unreachable." },
    detections: [],
    reasons: [{ code: "MODEL_UNAVAILABLE", severity: "review", message: "Detector unavailable: offline.", rule: "A detector result is required for PASS or REJECT." }],
    timings: { totalMs: 10, serviceRoundTripMs: null, decodeMs: null, qualityMs: null, preprocessMs: null, inferenceMs: null, postprocessMs: null },
    warnings: ["Inference service: Inference service is unreachable."],
    ...partial,
  };
}

describe("ResultPanel", () => {
  it("states that no AI prediction was made when the model is unavailable", () => {
    render(<ResultPanel record={record({})} />);
    expect(screen.getByText("Model unavailable")).toBeInTheDocument();
    expect(screen.getByText(/No AI prediction was made/)).toBeInTheDocument();
    expect(screen.getByText(/No detector output/)).toBeInTheDocument();
    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
  });

  it("lists detections with scores and highlights on hover", async () => {
    const onHighlight = vi.fn();
    render(
      <ResultPanel
        onHighlight={onHighlight}
        record={record({
          decision: "REJECT",
          defectCount: 1,
          detectorStatus: "ok",
          modelId: "yolov8n-neu-det",
          modelVersion: "1",
          detections: [{ classId: 5, className: "scratches", classKey: "scratches", confidence: 0.912, box: { x1: 1, y1: 2, x2: 30, y2: 40 }, outcome: "reject" }],
          reasons: [{ code: "DEFECT_REJECT", severity: "reject", message: "Scratches detected with score 0.91.", rule: "Scratches: score >= 0.50 rejects." }],
        })}
      />,
    );
    expect(screen.getByText("REJECT")).toBeInTheDocument();
    expect(screen.getByText("0.912")).toBeInTheDocument();
    expect(screen.getByText(/Rule: Scratches: score >= 0.50 rejects./)).toBeInTheDocument();
    await userEvent.hover(screen.getByText("0.912"));
    expect(onHighlight).toHaveBeenCalledWith(0);
  });
});
