import type { Metadata } from "next";
import { LiveModelPanel } from "@/components/models/LiveModelPanel";
import { KeyValue, Notice, PageIntro, Panel, PanelHeader, Tag } from "@/components/ui/primitives";
import { listProfiles } from "@/lib/db/profiles";
import { ANOMALY_BRANCH, MODEL_REGISTRY, UNVALIDATED_COMPONENTS } from "@/lib/models/registry";

export const metadata: Metadata = { title: "Models & performance" };
export const dynamic = "force-dynamic";

export default function ModelsPage() {
  const profiles = listProfiles();
  return (
    <>
      <PageIntro>
        Live model status is checked against the running inference service. Research metrics below are historical results from the project paper and
        are shown separately; they are not measurements of the currently loaded weights.
      </PageIntro>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <LiveModelPanel profiles={profiles.map((p) => ({ id: p.id, name: p.name, modelId: p.modelId, classKeys: p.classes.filter((c) => c.enabled).map((c) => c.key) }))} />

        <div className="space-y-5">
          {MODEL_REGISTRY.map((m) => {
            const usedBy = profiles.filter((p) => p.modelId === m.modelId);
            return (
              <Panel key={m.modelId}>
                <PanelHeader title={m.name} description={<span className="font-mono">{m.modelId}</span>} actions={<Tag tone="info">Registry entry</Tag>} />
                <div className="space-y-4 p-4">
                  <KeyValue
                    items={[
                      ["Framework", m.framework],
                      ["Task", m.task],
                      ["Artifact", m.artifact],
                      ["Input resolution", m.inputResolution],
                      ["Defect classes", m.classes.join(", ")],
                      ["Used by profiles", usedBy.length ? usedBy.map((p) => p.name).join(", ") : "None"],
                    ]}
                  />
                  {m.research ? (
                    <div className="rounded-md border border-line bg-sunken">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                        <h3 className="text-[13px] font-semibold">Historical research result</h3>
                        <Tag tone="warn">Not live performance</Tag>
                      </div>
                      <div className="p-3">
                        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
                          {m.research.metrics.map((x) => (
                            <div key={x.label} className="bg-panel px-3 py-2.5">
                              <dt className="eyebrow">{x.label}</dt>
                              <dd className="tabular mt-1 font-mono text-[17px] font-medium">{x.value}</dd>
                            </div>
                          ))}
                        </dl>
                        <KeyValue
                          className="mt-3"
                          items={[
                            ["Source", m.research.source],
                            ["Dataset", m.research.dataset],
                            ["Split", m.research.split],
                            ["Runs", m.research.runs],
                          ]}
                        />
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                          {m.research.caveats.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Panel>
            );
          })}

          <Panel>
            <PanelHeader title={ANOMALY_BRANCH.name} description="Research branch, not used in decisions" actions={<Tag tone="neutral">Not integrated</Tag>} />
            <div className="space-y-3 p-4">
              <KeyValue
                items={[
                  ["Dataset", ANOMALY_BRANCH.dataset],
                  ["Image-level AUROC", ANOMALY_BRANCH.auroc],
                ]}
              />
              <Notice tone="warn">{ANOMALY_BRANCH.interpretation}</Notice>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Not yet validated" />
            <ul className="list-disc space-y-1.5 py-3 pl-9 pr-4 text-[13px] text-muted">
              {UNVALIDATED_COMPONENTS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
