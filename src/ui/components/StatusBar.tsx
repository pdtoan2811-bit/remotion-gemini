import type { PromptJob } from "../../lib/types";

interface StatusBarProps {
  job: PromptJob;
}

const STEPS = [
  { key: "queued", label: "Prompt Submitted" },
  { key: "processing", label: "Agent Processing" },
  { key: "rendering", label: "Rendering Video" },
  { key: "done", label: "Complete" },
] as const;

function getStepState(
  stepKey: string,
  jobStatus: string
): "pending" | "active" | "done" {
  const order = ["queued", "processing", "rendering", "done"];
  const stepIdx = order.indexOf(stepKey);
  const jobIdx = order.indexOf(jobStatus);

  if (jobStatus === "error") {
    return stepIdx <= 1 ? "done" : "pending";
  }
  if (stepIdx < jobIdx) return "done";
  if (stepIdx === jobIdx) return "active";
  return "pending";
}

export const StatusBar: React.FC<StatusBarProps> = ({ job }) => {
  return (
    <div className="status-bar">
      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="status-bar__progress">
        <div className="status-bar__track">
          <div
            className="status-bar__fill"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <span className="status-bar__pct">{job.progress}%</span>
      </div>

      {/* ── Step indicators ───────────────────────────────────────────── */}
      <div className="status-bar__steps">
        {STEPS.map((step) => {
          const state = getStepState(step.key, job.status);
          return (
            <span
              key={step.key}
              className={`status-step status-step--${state}`}
            >
              {state === "done" ? "✓" : state === "active" ? "●" : "○"}{" "}
              {step.label}
            </span>
          );
        })}
      </div>

      {/* ── Status message ────────────────────────────────────────────── */}
      {job.statusMessage && (
        <div className="status-message">{job.statusMessage}</div>
      )}
    </div>
  );
};
