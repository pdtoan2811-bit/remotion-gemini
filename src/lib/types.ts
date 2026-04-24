// ── Shared Types ──────────────────────────────────────────────────────────────

/** Status of a video generation job */
export type JobStatus =
  | "queued"
  | "processing"
  | "rendering"
  | "done"
  | "error";

/** A prompt job submitted via the UI */
export interface PromptJob {
  id: string;
  prompt: string;
  template: TemplateType;
  options: PromptOptions;
  projectId: string;
  status: JobStatus;
  progress: number; // 0-100
  statusMessage: string;
  compositionId: string | null;
  videoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  parentJobId: string | null;
  refinedSceneId: string | null;
}

/** Available video templates */
export type TemplateType =
  | "news-short"
  | "documentary"
  | "ai-summary"
  | "custom";

/** Advanced options for video generation */
export interface PromptOptions {
  voiceId?: string;
  fps?: number;
  width?: number;
  height?: number;
  sceneCount?: number;
  maxSceneDuration?: number;
  targetDuration?: number;
  style?: "kinetic" | "formal" | "minimal";
  projectId?: string;
  refineScene?: string;
  parentJobId?: string;
}

/** User-managed project that groups related videos and refinements */
export interface VideoProject {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  videoCount: number;
}

/** A single scene in the video timeline */
export interface Scene {
  id: string;
  caption: string;
  tag: string;
  voiceoverText: string;
  imageDescription: string;
  audioDurationFrames?: number;
}

/** Word-level timing for subtitle sync */
export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

/** Timeline JSON structure (matches AInewsvideo pattern) */
export interface Timeline {
  scenes: Scene[];
  wordTimings?: WordTiming[][];
  totalDurationFrames: number;
}

/** WebSocket message types */
export type WsMessage =
  | { type: "status"; jobId: string; status: JobStatus; progress: number; message: string }
  | { type: "done"; jobId: string; videoUrl: string }
  | { type: "error"; jobId: string; error: string };

/** Prompt file written to .prompts/ directory */
export interface PromptFile {
  id: string;
  prompt: string;
  template: TemplateType;
  options: PromptOptions;
  projectId?: string;
  createdAt: string;
}

/** Backend readiness state for Antigravity prompting */
export interface ReadinessStatus {
  canPrompt: boolean;
  summary: string;
  checks: {
    serverOnline: boolean;
    mcpBridgeOnline: boolean;
    antigravityAttached: boolean;
  };
  heartbeat: {
    heartbeatAt: string | null;
    heartbeatAgeSec: number | null;
    requestCount: number;
    lastRequestAt: string | null;
  };
}
