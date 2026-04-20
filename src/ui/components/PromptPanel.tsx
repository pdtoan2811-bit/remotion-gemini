import { useState } from "react";

interface PromptPanelProps {
  onSubmit: (prompt: string, template: string, options: Record<string, unknown>) => void;
  isSubmitting: boolean;
}

const TEMPLATES = [
  { value: "news-short", label: "📰 News Short", desc: "Fast-paced news video with kinetic captions" },
  { value: "documentary", label: "🎥 Documentary", desc: "Formal documentary with broadcast-style layout" },
  { value: "ai-summary", label: "🤖 AI Summary", desc: "Explainer video about AI topics" },
  { value: "custom", label: "✨ Custom", desc: "Fully customized from your prompt" },
];

export const PromptPanel: React.FC<PromptPanelProps> = ({ onSubmit, isSubmitting }) => {
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("custom");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sceneCount, setSceneCount] = useState("6");
  const [style, setStyle] = useState("kinetic");

  const handleSubmit = () => {
    if (!prompt.trim() || isSubmitting) return;
    onSubmit(prompt.trim(), template, {
      sceneCount: parseInt(sceneCount) || 6,
      style,
    });
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="prompt-panel">
      {/* ── Section: Template ─────────────────────────────────────────── */}
      <div className="prompt-panel__section">
        <label className="prompt-panel__label">Template</label>
        <select
          className="prompt-panel__select"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          id="template-select"
        >
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
          {TEMPLATES.find((t) => t.value === template)?.desc}
        </div>
      </div>

      {/* ── Section: Prompt ───────────────────────────────────────────── */}
      <div className="prompt-panel__section">
        <label className="prompt-panel__label">Video Prompt</label>
        <textarea
          id="prompt-input"
          className="prompt-panel__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe the video you want to generate...\n\nExamples:\n• "Breaking: SpaceX launches first Mars colony ship"\n• "Top 5 AI tools that will replace your job in 2026"\n• "Explain quantum computing in 60 seconds"`}
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
          ⌘+Enter to submit
        </div>
      </div>

      {/* ── Advanced Options ───────────────────────────────────────────── */}
      <button
        className="advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
        type="button"
      >
        <span
          className={`advanced-toggle__arrow ${showAdvanced ? "advanced-toggle__arrow--open" : ""}`}
        >
          ▶
        </span>
        Advanced Options
      </button>

      {showAdvanced && (
        <div className="advanced-options">
          <div className="advanced-options__field">
            <label className="advanced-options__field-label">Scenes</label>
            <input
              className="advanced-options__input"
              type="number"
              min="3"
              max="30"
              value={sceneCount}
              onChange={(e) => setSceneCount(e.target.value)}
              id="scene-count-input"
            />
          </div>
          <div className="advanced-options__field">
            <label className="advanced-options__field-label">Style</label>
            <select
              className="prompt-panel__select"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              id="style-select"
              style={{ fontSize: 13, padding: "4px 8px" }}
            >
              <option value="kinetic">⚡ Kinetic</option>
              <option value="formal">📐 Formal</option>
              <option value="minimal">🔲 Minimal</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Submit Button ─────────────────────────────────────────────── */}
      <button
        id="generate-btn"
        className={`generate-btn ${isSubmitting ? "generate-btn--loading" : ""}`}
        onClick={handleSubmit}
        disabled={!prompt.trim() || isSubmitting}
        type="button"
      >
        {isSubmitting ? (
          <>Submitting...</>
        ) : (
          <>
            🚀 Generate Video
            <span className="generate-btn__shimmer" />
          </>
        )}
      </button>

      {/* ── Help Text ─────────────────────────────────────────────────── */}
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
        1. Type your video prompt above
        <br />
        2. Click Generate — a prompt file is created
        <br />
        3. Antigravity agent picks it up and generates assets
        <br />
        4. Video renders automatically when ready
        <br />
        <br />
        <em>
          Or click "📋 Copy Prompt" on any job to paste into Antigravity manually.
        </em>
      </div>
    </div>
  );
};
