import { useMemo, useState, useEffect } from "react";
import type { ReadinessStatus, Scene, VideoProject } from "../../lib/types";

interface PromptPanelProps {
  onSubmit: (
    prompt: string,
    template: string,
    options: Record<string, unknown>
  ) => void;
  isSubmitting: boolean;
  readiness: ReadinessStatus | null;
  selectedScene: Scene | null;
  activeJobId: string | null;
  activeJobProjectId: string | null;
  projects: VideoProject[];
  onCreateProject: (
    name: string,
    description?: string
  ) => Promise<VideoProject | null>;
  onClearScene: () => void;
}

const TEMPLATES = [
  {
    value: "news-short",
    label: "News Short",
    desc: "Fast-paced news video with kinetic captions",
  },
  {
    value: "documentary",
    label: "Documentary",
    desc: "Formal documentary with broadcast-style layout",
  },
  {
    value: "ai-summary",
    label: "AI Summary",
    desc: "Explainer video about AI topics",
  },
  {
    value: "custom",
    label: "Custom",
    desc: "Fully customized from your prompt",
  },
];

const DEFAULT_PROJECT_ID = "general";

export const PromptPanel: React.FC<PromptPanelProps> = ({
  onSubmit,
  isSubmitting,
  readiness,
  selectedScene,
  activeJobId,
  activeJobProjectId,
  projects,
  onCreateProject,
  onClearScene,
}) => {
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("custom");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetDuration, setTargetDuration] = useState("60");
  const [customDuration, setCustomDuration] = useState("");
  const [maxSceneDuration, setMaxSceneDuration] = useState("3");
  const [style, setStyle] = useState("kinetic");
  const [selectedProjectId, setSelectedProjectId] = useState(DEFAULT_PROJECT_ID);
  const [showProjectCreate, setShowProjectCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const isRefining = selectedScene !== null;

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects]
  );

  useEffect(() => {
    if (isRefining && activeJobProjectId) {
      setSelectedProjectId(activeJobProjectId);
      return;
    }

    if (projectIds.has(selectedProjectId)) return;
    if (projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    } else {
      setSelectedProjectId(DEFAULT_PROJECT_ID);
    }
  }, [activeJobProjectId, isRefining, projectIds, projects, selectedProjectId]);

  const readinessTone = !readiness
    ? "waiting"
    : readiness.canPrompt
      ? "ready"
      : readiness.checks.mcpBridgeOnline
        ? "waiting"
        : "offline";
  const canPromptNow = Boolean(readiness?.canPrompt);
  const readinessTitle = canPromptNow ? "Ready: Start Prompting" : "Not Ready Yet";
  const readinessSummary = !readiness ? "Checking readiness..." : readiness.summary;

  const effectiveProjectId =
    isRefining && activeJobProjectId ? activeJobProjectId : selectedProjectId;
  const effectiveProjectName =
    projects.find((project) => project.id === effectiveProjectId)?.name ??
    DEFAULT_PROJECT_ID;

  const handleSubmit = () => {
    if (!prompt.trim() || isSubmitting) return;

    const options: Record<string, unknown> = {
      targetDuration:
        targetDuration === "custom"
          ? parseInt(customDuration, 10) || 60
          : parseInt(targetDuration, 10),
      maxSceneDuration: parseFloat(maxSceneDuration) || 3,
      style,
      projectId: effectiveProjectId,
    };

    if (isRefining && activeJobId) {
      options.refineScene = selectedScene?.id;
      options.parentJobId = activeJobId;
    }

    onSubmit(prompt.trim(), template, options);
    setPrompt("");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      handleSubmit();
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || isCreatingProject) return;

    setIsCreatingProject(true);
    setProjectError(null);
    try {
      const created = await onCreateProject(name);
      if (!created) {
        setProjectError("Could not create project. Try another name.");
        return;
      }
      setSelectedProjectId(created.id);
      setNewProjectName("");
      setShowProjectCreate(false);
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <div className="prompt-panel">
      <div className={`readiness-card readiness-card--${readinessTone}`}>
        <div className="readiness-card__header">
          <span className={`readiness-dot readiness-dot--${readinessTone}`} />
          <strong className="readiness-card__title">{readinessTitle}</strong>
        </div>
        <div className="readiness-card__summary">{readinessSummary}</div>
        {readiness && (
          <div className="readiness-checks">
            <span
              className={`readiness-check ${
                readiness.checks.serverOnline
                  ? "readiness-check--ok"
                  : "readiness-check--bad"
              }`}
            >
              Server: {readiness.checks.serverOnline ? "online" : "offline"}
            </span>
            <span
              className={`readiness-check ${
                readiness.checks.mcpBridgeOnline
                  ? "readiness-check--ok"
                  : "readiness-check--bad"
              }`}
            >
              Bridge: {readiness.checks.mcpBridgeOnline ? "online" : "offline"}
            </span>
            <span
              className={`readiness-check ${
                readiness.checks.antigravityAttached
                  ? "readiness-check--ok"
                  : "readiness-check--bad"
              }`}
            >
              Antigravity:{" "}
              {readiness.checks.antigravityAttached ? "attached" : "waiting"}
            </span>
          </div>
        )}
      </div>

      <div className="prompt-panel__section">
        <label className="prompt-panel__label">Project</label>
        {isRefining ? (
          <div className="project-chip project-chip--locked">
            Editing in project: {effectiveProjectName}
          </div>
        ) : (
          <>
            <select
              className="prompt-panel__select"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.videoCount})
                </option>
              ))}
            </select>
            <div className="project-actions">
              <button
                className="project-create-btn"
                onClick={() => setShowProjectCreate((value) => !value)}
                type="button"
              >
                {showProjectCreate ? "Cancel" : "+ New Project"}
              </button>
            </div>
            {showProjectCreate && (
              <div className="project-create-row">
                <input
                  className="advanced-options__input project-create-input"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Project name"
                />
                <button
                  className="project-create-confirm"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || isCreatingProject}
                  type="button"
                >
                  {isCreatingProject ? "Creating..." : "Create"}
                </button>
              </div>
            )}
            {projectError && <div className="project-error">{projectError}</div>}
          </>
        )}
      </div>

      {isRefining && (
        <div className="refine-indicator">
          <div className="refine-indicator__badge">
            <span className="refine-indicator__icon">🎯</span>
            <span className="refine-indicator__label">
              Refining: {selectedScene?.tag}
            </span>
          </div>
          <div className="refine-indicator__caption">
            {selectedScene?.caption.replace(/\n/g, " ")}
          </div>
          <button
            className="refine-indicator__clear"
            onClick={onClearScene}
            type="button"
          >
            Clear selection - prompt full video
          </button>
        </div>
      )}

      {!isRefining && (
        <div className="prompt-panel__section">
          <label className="prompt-panel__label">Template</label>
          <select
            className="prompt-panel__select"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            id="template-select"
          >
            {TEMPLATES.map((templateItem) => (
              <option key={templateItem.value} value={templateItem.value}>
                {templateItem.label}
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              lineHeight: 1.4,
            }}
          >
            {TEMPLATES.find((templateItem) => templateItem.value === template)?.desc}
          </div>
        </div>
      )}

      <div className="prompt-panel__section">
        <label className="prompt-panel__label">
          {isRefining ? "Scene Enhancement Prompt" : "Video Prompt"}
        </label>
        <textarea
          id="prompt-input"
          className="prompt-panel__textarea"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRefining
              ? `How should this scene change?\n\nExamples:\n- Make the caption more dramatic\n- Add benchmark context\n- Change tone to urgent`
              : `Describe the video you want to generate...\n\nExamples:\n- Breaking: SpaceX launches first Mars colony ship\n- Top 5 AI tools that will replace your job in 2026\n- Explain quantum computing in 60 seconds`
          }
          disabled={isSubmitting}
        />
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            textAlign: "right",
            fontFamily: "var(--font-mono)",
          }}
        >
          Ctrl/Cmd + Enter to submit
        </div>
      </div>

      {!isRefining && (
        <>
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            type="button"
          >
            <span
              className={`advanced-toggle__arrow ${
                showAdvanced ? "advanced-toggle__arrow--open" : ""
              }`}
            >
              ▶
            </span>
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="advanced-options">
              <div className="advanced-options__field">
                <label className="advanced-options__field-label">Target Duration</label>
                <div className="duration-presets">
                  {["60", "90", "120"].map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      className={`duration-preset-btn ${
                        targetDuration === duration
                          ? "duration-preset-btn--active"
                          : ""
                      }`}
                      onClick={() => {
                        setTargetDuration(duration);
                        setCustomDuration("");
                      }}
                    >
                      {duration}s
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`duration-preset-btn ${
                      targetDuration === "custom"
                        ? "duration-preset-btn--active"
                        : ""
                    }`}
                    onClick={() => setTargetDuration("custom")}
                  >
                    Custom
                  </button>
                </div>
                {targetDuration === "custom" && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      className="advanced-options__input"
                      type="number"
                      min="15"
                      max="300"
                      step="5"
                      value={customDuration}
                      onChange={(event) => setCustomDuration(event.target.value)}
                      placeholder="e.g. 45"
                      style={{ width: 80 }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      seconds
                    </span>
                  </div>
                )}
              </div>

              <div className="advanced-options__field">
                <label className="advanced-options__field-label">
                  Max Duration / Scene
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="advanced-options__input"
                    type="number"
                    min="1"
                    max="15"
                    step="0.5"
                    value={maxSceneDuration}
                    onChange={(event) => setMaxSceneDuration(event.target.value)}
                    style={{ width: 70 }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    seconds
                  </span>
                </div>
              </div>

              <div className="advanced-options__field">
                <label className="advanced-options__field-label">Style</label>
                <select
                  className="prompt-panel__select"
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  style={{ fontSize: 13, padding: "4px 8px" }}
                >
                  <option value="kinetic">Kinetic</option>
                  <option value="formal">Formal</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
            </div>
          )}
        </>
      )}

      <button
        id="generate-btn"
        className={`generate-btn ${
          isSubmitting ? "generate-btn--loading" : ""
        } ${isRefining ? "generate-btn--refine" : ""}`}
        onClick={handleSubmit}
        disabled={!prompt.trim() || isSubmitting}
        type="button"
      >
        {isSubmitting
          ? "Submitting..."
          : isRefining
            ? "Refine Scene"
            : readiness?.canPrompt
              ? "Generate Video"
              : "Queue Prompt"}
      </button>

      {!canPromptNow && !isRefining && (
        <div className="readiness-help">
          Prompt submissions are queued until Antigravity attaches.
        </div>
      )}

      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.6,
          padding: "var(--space-md) 0",
          borderTop: "1px solid var(--surface-glass-border)",
        }}
      >
        <strong style={{ color: "var(--text-secondary)" }}>How it works:</strong>
        <br />
        1. Pick a project and type your video prompt
        <br />
        2. Click Generate - a prompt file is created
        <br />
        3. Antigravity agent picks it up and generates assets
        <br />
        4. Preview plays live and you can refine scenes
      </div>
    </div>
  );
};
