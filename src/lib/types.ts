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
  status: JobStatus;
  progress: number; // 0-100
  statusMessage: string;
  compositionId: string | null;
  videoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
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
  style?: "kinetic" | "formal" | "minimal";
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
  createdAt: string;
}
