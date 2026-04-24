/**
 * Remotion Prompt Studio - Express backend server
 *
 * Responsibilities:
 * 1. Receive prompt submissions from the UI
 * 2. Persist prompt files for agent consumption
 * 3. Watch for .done / .status updates from the agent
 * 4. Trigger Remotion renders
 * 5. Stream progress via WebSocket
 * 6. Persist projects and recover historical jobs on startup
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { watch } from "chokidar";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import type {
  PromptJob,
  PromptFile,
  JobStatus,
  WsMessage,
  TemplateType,
  PromptOptions,
  VideoProject,
} from "../src/lib/types.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const PROMPTS_DIR = path.resolve(".prompts");
const OUTPUT_DIR = path.resolve("out");
const PUBLIC_DIR = path.resolve("public");
const CONTENT_DIR = path.join(PUBLIC_DIR, "content");
const PROJECTS_PATH = path.join(PROMPTS_DIR, "projects.json");
const MCP_HEARTBEAT_PATH = path.join(
  PROMPTS_DIR,
  "_mcp_bridge_heartbeat.json"
);
const DEFAULT_PROJECT_ID = "general";

const TEMPLATE_SET: Set<TemplateType> = new Set([
  "news-short",
  "documentary",
  "ai-summary",
  "custom",
]);
const JOB_STATUS_SET: Set<JobStatus> = new Set([
  "queued",
  "processing",
  "rendering",
  "done",
  "error",
]);

type PersistedProject = Omit<VideoProject, "videoCount">;

type BridgeHeartbeat = {
  bridge?: string;
  pid?: number;
  startedAt?: string;
  heartbeatAt?: string;
  requestCount?: number;
  lastRequestAt?: string | null;
};

type StatusFile = {
  status?: JobStatus;
  progress?: number;
  message?: string;
};

const jobs = new Map<string, PromptJob>();
const projects = new Map<string, PersistedProject>();

[PROMPTS_DIR, OUTPUT_DIR, PUBLIC_DIR, CONTENT_DIR].forEach((dir) =>
  fs.mkdirSync(dir, { recursive: true })
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampProgress(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function projectNameToId(name: string): string {
  const base = normalizeProjectName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "project";
}

function makeProjectNameFromId(projectId: string): string {
  return projectId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toTemplate(value: unknown): TemplateType {
  if (typeof value === "string" && TEMPLATE_SET.has(value as TemplateType)) {
    return value as TemplateType;
  }
  return "custom";
}

function toOptions(value: unknown): PromptOptions {
  if (!isRecord(value)) return {};
  const options: PromptOptions = {};

  if (typeof value.voiceId === "string") options.voiceId = value.voiceId;
  if (typeof value.fps === "number") options.fps = value.fps;
  if (typeof value.width === "number") options.width = value.width;
  if (typeof value.height === "number") options.height = value.height;
  if (typeof value.sceneCount === "number") options.sceneCount = value.sceneCount;
  if (typeof value.maxSceneDuration === "number") {
    options.maxSceneDuration = value.maxSceneDuration;
  }
  if (typeof value.targetDuration === "number") {
    options.targetDuration = value.targetDuration;
  }
  if (
    value.style === "kinetic" ||
    value.style === "formal" ||
    value.style === "minimal"
  ) {
    options.style = value.style;
  }
  if (typeof value.refineScene === "string") options.refineScene = value.refineScene;
  if (typeof value.parentJobId === "string") options.parentJobId = value.parentJobId;
  if (typeof value.projectId === "string") options.projectId = value.projectId;

  return options;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getFileMtime(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime.toISOString();
}

function maxIsoDate(...dates: Array<string | null | undefined>): string {
  const values = dates
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date).getTime())
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return new Date().toISOString();
  return new Date(Math.max(...values)).toISOString();
}

function saveProjectsToDisk() {
  const list = Array.from(projects.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(list, null, 2));
}

function ensureUniqueProjectId(base: string): string {
  let candidate = base || "project";
  let suffix = 2;
  while (projects.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function ensureDefaultProject() {
  if (projects.has(DEFAULT_PROJECT_ID)) return;
  const now = new Date().toISOString();
  projects.set(DEFAULT_PROJECT_ID, {
    id: DEFAULT_PROJECT_ID,
    name: "General",
    description: "Default project for quick generations",
    createdAt: now,
    updatedAt: now,
  });
}

function ensureImportedProject(projectId: string) {
  if (projects.has(projectId)) return;
  const now = new Date().toISOString();
  projects.set(projectId, {
    id: projectId,
    name: makeProjectNameFromId(projectId) || "Imported Project",
    description: "Recovered from historical prompts",
    createdAt: now,
    updatedAt: now,
  });
}

function getProjectIdOrDefault(candidate: unknown): string {
  if (typeof candidate === "string" && projects.has(candidate)) {
    return candidate;
  }
  return DEFAULT_PROJECT_ID;
}

function createProject(name: string, description: string | null): PersistedProject {
  const cleanedName = normalizeProjectName(name);
  const baseId = projectNameToId(cleanedName);
  const id = ensureUniqueProjectId(baseId);
  const now = new Date().toISOString();
  const project: PersistedProject = {
    id,
    name: cleanedName,
    description,
    createdAt: now,
    updatedAt: now,
  };
  projects.set(project.id, project);
  saveProjectsToDisk();
  return project;
}

function listProjects(): VideoProject[] {
  return Array.from(projects.values())
    .map((project) => ({
      ...project,
      videoCount: Array.from(jobs.values()).filter(
        (job) => job.projectId === project.id
      ).length,
    }))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

function hydrateProjectsFromDisk() {
  const rawProjects = readJsonFile<unknown>(PROJECTS_PATH);
  if (Array.isArray(rawProjects)) {
    for (const rawProject of rawProjects) {
      if (!isRecord(rawProject)) continue;
      if (typeof rawProject.id !== "string") continue;
      if (typeof rawProject.name !== "string") continue;
      const createdAt =
        typeof rawProject.createdAt === "string"
          ? rawProject.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof rawProject.updatedAt === "string"
          ? rawProject.updatedAt
          : createdAt;
      projects.set(rawProject.id, {
        id: rawProject.id,
        name: normalizeProjectName(rawProject.name),
        description:
          typeof rawProject.description === "string" ? rawProject.description : null,
        createdAt,
        updatedAt,
      });
    }
  }

  ensureDefaultProject();
  saveProjectsToDisk();
}

function inferJobState(
  jobId: string,
  createdAt: string
): Pick<
  PromptJob,
  | "status"
  | "progress"
  | "statusMessage"
  | "compositionId"
  | "videoUrl"
  | "updatedAt"
  | "error"
> {
  const donePath = path.join(PROMPTS_DIR, `${jobId}.done`);
  const statusPath = path.join(PROMPTS_DIR, `${jobId}.status.json`);
  const timelinePath = path.join(CONTENT_DIR, jobId, "timeline.json");
  const videoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  const hasDone = fs.existsSync(donePath);
  const hasTimeline = fs.existsSync(timelinePath);
  const hasVideo = fs.existsSync(videoPath);
  const statusData = readJsonFile<StatusFile>(statusPath);

  let status: JobStatus = "queued";
  let progress = 0;
  let statusMessage = "Prompt submitted - waiting for agent...";
  let compositionId: string | null = null;
  let videoUrl: string | null = null;
  let error: string | null = null;

  if (statusData && JOB_STATUS_SET.has(statusData.status ?? "queued")) {
    status = (statusData.status as JobStatus) ?? "processing";
    progress = clampProgress(statusData.progress, status === "processing" ? 50 : 0);
    statusMessage =
      statusData.message ??
      (status === "processing"
        ? "Agent is working on your video..."
        : "Job status updated.");
  }

  if (hasDone || hasTimeline) {
    status = "done";
    progress = 100;
    compositionId = jobId;
    statusMessage = hasVideo
      ? "Video ready!"
      : "Assets ready. Render to export final MP4.";
  }

  if (hasVideo) {
    status = "done";
    progress = 100;
    compositionId = jobId;
    videoUrl = `/out/${jobId}.mp4`;
    statusMessage = "Video ready!";
  }

  if (status === "error") {
    error = statusData?.message ?? "Unknown error";
  }

  const updatedAt = maxIsoDate(
    createdAt,
    getFileMtime(donePath),
    getFileMtime(statusPath),
    getFileMtime(timelinePath),
    getFileMtime(videoPath)
  );

  return {
    status,
    progress,
    statusMessage,
    compositionId,
    videoUrl,
    updatedAt,
    error,
  };
}

function hydrateJobFromPromptFile(promptPath: string): PromptJob | null {
  const promptFile = readJsonFile<PromptFile>(promptPath);
  if (!promptFile) return null;
  if (typeof promptFile.id !== "string") return null;
  if (typeof promptFile.prompt !== "string") return null;

  const options = toOptions(promptFile.options);
  if (!options.projectId && typeof promptFile.projectId === "string") {
    options.projectId = promptFile.projectId;
  }

  const requestedProjectId =
    typeof options.projectId === "string" ? options.projectId : null;
  if (requestedProjectId && !projects.has(requestedProjectId)) {
    ensureImportedProject(requestedProjectId);
  }
  const projectId = getProjectIdOrDefault(options.projectId);
  options.projectId = projectId;

  const createdAt =
    typeof promptFile.createdAt === "string"
      ? promptFile.createdAt
      : getFileMtime(promptPath) ?? new Date().toISOString();
  const inferred = inferJobState(promptFile.id, createdAt);

  return {
    id: promptFile.id,
    prompt: promptFile.prompt,
    template: toTemplate(promptFile.template),
    options,
    projectId,
    status: inferred.status,
    progress: inferred.progress,
    statusMessage: inferred.statusMessage,
    compositionId: inferred.compositionId,
    videoUrl: inferred.videoUrl,
    createdAt,
    updatedAt: inferred.updatedAt,
    error: inferred.error,
    parentJobId: typeof options.parentJobId === "string" ? options.parentJobId : null,
    refinedSceneId: typeof options.refineScene === "string" ? options.refineScene : null,
  };
}

function hydrateJobsFromDisk() {
  jobs.clear();
  const files = fs
    .readdirSync(PROMPTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !file.endsWith(".status.json"))
    .filter((file) => file !== path.basename(MCP_HEARTBEAT_PATH))
    .filter((file) => file !== path.basename(PROJECTS_PATH));

  for (const file of files) {
    const job = hydrateJobFromPromptFile(path.join(PROMPTS_DIR, file));
    if (job) {
      jobs.set(job.id, job);
    }
  }
}

function ensureJobLoaded(jobId: string): PromptJob | undefined {
  const existing = jobs.get(jobId);
  if (existing) return existing;
  const promptPath = path.join(PROMPTS_DIR, `${jobId}.json`);
  if (!fs.existsSync(promptPath)) return undefined;
  const hydrated = hydrateJobFromPromptFile(promptPath);
  if (!hydrated) return undefined;
  jobs.set(hydrated.id, hydrated);
  return hydrated;
}

function touchProject(projectId: string) {
  const project = projects.get(projectId);
  if (!project) return;
  project.updatedAt = new Date().toISOString();
  saveProjectsToDisk();
}

function createJob(
  prompt: string,
  template: TemplateType,
  options: PromptOptions
): PromptJob {
  const id = uuidv4().slice(0, 8);
  const now = new Date().toISOString();
  const projectId = getProjectIdOrDefault(options.projectId);
  const mergedOptions: PromptOptions = { ...options, projectId };

  const job: PromptJob = {
    id,
    prompt,
    template,
    options: mergedOptions,
    projectId,
    status: "queued",
    progress: 0,
    statusMessage: "Prompt submitted - waiting for agent...",
    compositionId: null,
    videoUrl: null,
    createdAt: now,
    updatedAt: now,
    error: null,
    parentJobId: typeof mergedOptions.parentJobId === "string" ? mergedOptions.parentJobId : null,
    refinedSceneId: typeof mergedOptions.refineScene === "string" ? mergedOptions.refineScene : null,
  };

  jobs.set(id, job);
  touchProject(projectId);
  return job;
}

function updateJob(id: string, updates: Partial<PromptJob>): PromptJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  const incomingProjectId = updates.projectId;
  if (incomingProjectId && projects.has(incomingProjectId)) {
    job.projectId = incomingProjectId;
    job.options = { ...job.options, projectId: incomingProjectId };
    touchProject(incomingProjectId);
  }

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  job.options = { ...job.options, projectId: job.projectId };
  return job;
}

function writePromptFiles(job: PromptJob) {
  const promptFile: PromptFile = {
    id: job.id,
    prompt: job.prompt,
    template: job.template,
    options: job.options,
    projectId: job.projectId,
    createdAt: job.createdAt,
  };

  const promptPath = path.join(PROMPTS_DIR, `${job.id}.json`);
  fs.writeFileSync(promptPath, JSON.stringify(promptFile, null, 2));

  const readablePath = path.join(PROMPTS_DIR, `${job.id}.md`);
  const readableContent = `# Video Generation Prompt

**Job ID:** ${job.id}
**Project:** ${job.projectId}
**Template:** ${job.template}
**Created:** ${job.createdAt}

## Prompt

${job.prompt}

## Options

${JSON.stringify(job.options, null, 2)}

---

## Instructions for Antigravity Agent

1. Read this prompt and generate a Remotion video composition
2. Generate voiceover audio using ElevenLabs
3. Fetch or generate background images
4. Create composition assets in \`public/content/${job.id}/\`
5. Write \`timeline.json\` to \`public/content/${job.id}/timeline.json\`
6. When done, create \`.prompts/${job.id}.done\`
`;
  fs.writeFileSync(readablePath, readableContent);
}

function getReadinessStatus() {
  const now = Date.now();
  let heartbeat: BridgeHeartbeat | null = null;
  let heartbeatAgeMs: number | null = null;

  try {
    if (fs.existsSync(MCP_HEARTBEAT_PATH)) {
      heartbeat = JSON.parse(fs.readFileSync(MCP_HEARTBEAT_PATH, "utf-8"));
      if (heartbeat?.heartbeatAt) {
        heartbeatAgeMs = now - new Date(heartbeat.heartbeatAt).getTime();
      }
    }
  } catch {
    heartbeat = null;
    heartbeatAgeMs = null;
  }

  const mcpBridgeOnline = heartbeatAgeMs !== null && heartbeatAgeMs < 15000;
  const antigravityAttached =
    typeof heartbeat?.requestCount === "number" && heartbeat.requestCount > 0;
  const canPrompt = mcpBridgeOnline && antigravityAttached;

  let summary: string;
  if (canPrompt) {
    summary = "Antigravity ready. You can start prompting.";
  } else if (!mcpBridgeOnline) {
    summary = "MCP bridge is offline. Start it to route prompts into Antigravity.";
  } else {
    summary =
      "MCP bridge is online, waiting for Antigravity to attach to this workspace.";
  }

  return {
    canPrompt,
    summary,
    checks: {
      serverOnline: true,
      mcpBridgeOnline,
      antigravityAttached,
    },
    heartbeat: {
      heartbeatAt: heartbeat?.heartbeatAt ?? null,
      heartbeatAgeSec:
        heartbeatAgeMs !== null
          ? Math.max(0, Math.floor(heartbeatAgeMs / 1000))
          : null,
      requestCount: heartbeat?.requestCount ?? 0,
      lastRequestAt: heartbeat?.lastRequestAt ?? null,
    },
  };
}

hydrateProjectsFromDisk();
hydrateJobsFromDisk();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/out", express.static(OUTPUT_DIR));
app.use("/public", express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/readiness", (_req, res) => {
  res.json(getReadinessStatus());
});

app.get("/api/env-status", (_req, res) => {
  const mask = (key?: string) => {
    if (!key) return { configured: false, hint: "not set" };
    return { configured: true, hint: `${key.slice(0, 6)}...${key.slice(-4)}` };
  };
  res.json({
    elevenlabs: mask(process.env.ELEVENLABS_API_KEY),
    tavily: mask(process.env.TAVILY_API_KEY),
    openai: mask(process.env.OPENAI_API_KEY),
    gemini: mask(process.env.GEMINI_API_KEY),
  });
});

app.get("/api/projects", (_req, res) => {
  res.json(listProjects());
});

app.post("/api/projects", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const name = typeof body.name === "string" ? normalizeProjectName(body.name) : "";
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;

  if (!name) {
    res.status(400).json({ error: "Project name is required" });
    return;
  }

  const existing = Array.from(projects.values()).find(
    (project) => project.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    res.status(409).json({ error: "Project name already exists", project: existing });
    return;
  }

  const project = createProject(name, description);
  res.status(201).json({ ...project, videoCount: 0 });
});

app.patch("/api/projects/:id", (req, res) => {
  const project = projects.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const body = isRecord(req.body) ? req.body : {};
  if (typeof body.name === "string") {
    const nextName = normalizeProjectName(body.name);
    if (!nextName) {
      res.status(400).json({ error: "Project name cannot be empty" });
      return;
    }
    project.name = nextName;
  }
  if (typeof body.description === "string") {
    project.description = body.description.trim() || null;
  }
  project.updatedAt = new Date().toISOString();
  saveProjectsToDisk();

  const count = Array.from(jobs.values()).filter(
    (job) => job.projectId === project.id
  ).length;
  res.json({ ...project, videoCount: count });
});

app.post("/api/prompt", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const template = toTemplate(body.template);
  const options = toOptions(body.options);
  if (options.projectId && !projects.has(options.projectId)) {
    res.status(400).json({ error: "Unknown projectId" });
    return;
  }
  if (!options.projectId) {
    options.projectId = DEFAULT_PROJECT_ID;
  }

  const job = createJob(prompt, template, options);
  writePromptFiles(job);
  res.status(201).json(job);
});

app.get("/api/jobs", (_req, res) => {
  const allJobs = Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(allJobs);
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id) ?? ensureJobLoaded(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

app.get("/api/jobs/:id/timeline", (req, res) => {
  const timelinePath = path.join(CONTENT_DIR, req.params.id, "timeline.json");
  if (!fs.existsSync(timelinePath)) {
    res.status(404).json({ error: "Timeline not found" });
    return;
  }
  try {
    res.json(JSON.parse(fs.readFileSync(timelinePath, "utf-8")));
  } catch {
    res.status(500).json({ error: "Failed to parse timeline" });
  }
});

app.post("/api/jobs/:id/render", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "done") {
    res.status(400).json({ error: "Job must be done to render" });
    return;
  }

  job.status = "rendering";
  job.progress = 0;
  job.statusMessage = "Starting Remotion render...";
  job.updatedAt = new Date().toISOString();
  broadcastWs({
    type: "status",
    jobId: job.id,
    status: "rendering",
    progress: 0,
    message: "Starting render...",
  });

  const outputPath = path.join(OUTPUT_DIR, `${job.id}.mp4`);
  const compositionId = job.compositionId || job.id;
  const renderProc = spawn(
    "npx",
    ["remotion", "render", compositionId, "--output", outputPath, "--log", "verbose"],
    {
      cwd: path.resolve("."),
      shell: true,
      env: { ...process.env },
    }
  );

  const handleOutput = (buffer: Buffer) => {
    const line = buffer.toString();
    const match = line.match(/(\d+)\/(\d+)/);
    if (!match) return;
    const frame = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    if (!Number.isFinite(frame) || !Number.isFinite(total) || total <= 0) return;
    const progress = Math.min(Math.round((frame / total) * 100), 99);
    job.progress = progress;
    job.statusMessage = `Rendering: ${frame}/${total} frames`;
    job.updatedAt = new Date().toISOString();
    broadcastWs({
      type: "status",
      jobId: job.id,
      status: "rendering",
      progress,
      message: job.statusMessage,
    });
  };

  renderProc.stdout?.on("data", handleOutput);
  renderProc.stderr?.on("data", handleOutput);

  renderProc.on("close", (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      job.status = "done";
      job.progress = 100;
      job.videoUrl = `/out/${job.id}.mp4`;
      job.statusMessage = "Video rendered successfully!";
      job.updatedAt = new Date().toISOString();
      broadcastWs({ type: "done", jobId: job.id, videoUrl: job.videoUrl });
      return;
    }

    job.status = "error";
    job.error = `Render failed (exit ${code})`;
    job.statusMessage = "Render failed";
    job.updatedAt = new Date().toISOString();
    broadcastWs({ type: "error", jobId: job.id, error: job.error });
  });

  res.json({ message: "Render started", jobId: job.id });
});

app.get("/api/jobs/:id/clipboard", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const clipboardText = `Generate a ${job.template} video with this prompt:

"${job.prompt}"

Requirements:
- Keep this under project ${job.projectId}
- Create a Remotion composition with multiple scenes
- Generate voiceover per scene using ElevenLabs
- Write timeline to public/content/${job.id}/timeline.json
- Write audio to public/content/${job.id}/voice.mp3
- Create .prompts/${job.id}.done when assets are ready

Job ID: ${job.id}
Project ID: ${job.projectId}
Template: ${job.template}
Options: ${JSON.stringify(job.options)}`;

  res.json({ text: clipboardText });
});

app.post("/api/jobs/:id/status", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const nextStatus =
    typeof body.status === "string" && JOB_STATUS_SET.has(body.status as JobStatus)
      ? (body.status as JobStatus)
      : "processing";
  const progress = clampProgress(body.progress, nextStatus === "processing" ? 50 : 0);
  const message =
    typeof body.message === "string"
      ? body.message
      : "Agent is working on your video...";

  const job = updateJob(req.params.id, {
    status: nextStatus,
    progress,
    statusMessage: message,
  });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  broadcastWs({
    type: "status",
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.statusMessage,
  });
  res.json(job);
});

app.post("/api/jobs/:id/complete", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const videoPath =
    typeof body.videoPath === "string" ? body.videoPath : `/out/${req.params.id}.mp4`;
  const job = updateJob(req.params.id, {
    status: "done",
    progress: 100,
    statusMessage: "Video ready!",
    videoUrl: videoPath,
  });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  broadcastWs({ type: "done", jobId: job.id, videoUrl: job.videoUrl! });
  res.json(job);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const wsClients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => {
    wsClients.delete(ws);
  });
});

function broadcastWs(message: WsMessage) {
  const data = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function applyStatusFile(jobId: string, filePath: string) {
  const job = ensureJobLoaded(jobId);
  if (!job) return;

  const statusData = readJsonFile<StatusFile>(filePath);
  if (!statusData) return;

  const nextStatus =
    statusData.status && JOB_STATUS_SET.has(statusData.status)
      ? statusData.status
      : "processing";
  const nextProgress = clampProgress(
    statusData.progress,
    nextStatus === "processing" ? 50 : job.progress
  );
  const nextMessage =
    typeof statusData.message === "string" && statusData.message.trim().length > 0
      ? statusData.message
      : "Agent is working on your video...";

  const updated = updateJob(jobId, {
    status: nextStatus,
    progress: nextProgress,
    statusMessage: nextMessage,
    error: nextStatus === "error" ? nextMessage : null,
  });
  if (!updated) return;

  broadcastWs({
    type: "status",
    jobId: updated.id,
    status: updated.status,
    progress: updated.progress,
    message: updated.statusMessage,
  });
}

const watcher = watch(PROMPTS_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500 },
});

watcher.on("add", (filePath: string) => {
  const basename = path.basename(filePath);

  if (basename.endsWith(".done")) {
    const jobId = basename.replace(".done", "");
    const job = ensureJobLoaded(jobId);
    if (!job) return;

    const videoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    if (fs.existsSync(videoPath)) {
      updateJob(jobId, {
        status: "done",
        progress: 100,
        statusMessage: "Video ready!",
        compositionId: jobId,
        videoUrl: `/out/${jobId}.mp4`,
      });
      broadcastWs({ type: "done", jobId, videoUrl: `/out/${jobId}.mp4` });
      return;
    }

    const updated = updateJob(jobId, {
      status: "done",
      progress: 100,
      statusMessage: "Assets ready. Render to export final MP4.",
      compositionId: jobId,
      videoUrl: null,
    });
    if (!updated) return;

    broadcastWs({
      type: "status",
      jobId,
      status: "done",
      progress: 100,
      message: updated.statusMessage,
    });
    return;
  }

  if (basename.endsWith(".status.json")) {
    const jobId = basename.replace(".status.json", "");
    applyStatusFile(jobId, filePath);
  }
});

watcher.on("change", (filePath: string) => {
  const basename = path.basename(filePath);
  if (!basename.endsWith(".status.json")) return;
  const jobId = basename.replace(".status.json", "");
  applyStatusFile(jobId, filePath);
});

server.listen(PORT, () => {
  console.log(
    `[SERVER] Remotion Prompt Studio listening on http://localhost:${PORT}`
  );
  console.log(
    `[SERVER] Loaded ${jobs.size} historical jobs across ${projects.size} projects`
  );
});
