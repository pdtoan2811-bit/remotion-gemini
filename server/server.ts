/**
 * Remotion Prompt Studio — Express Backend Server
 *
 * Responsibilities:
 * 1. Receives prompt submissions from the UI (POST /api/prompt)
 * 2. Writes prompt files to .prompts/ for Antigravity agent consumption
 * 3. Watches for .done signals from the agent
 * 4. Triggers Remotion rendering when compositions are ready
 * 5. Streams progress via WebSocket
 * 6. Serves rendered videos
 */

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { watch } from "chokidar";
import { v4 as uuidv4 } from "uuid";
import type {
  PromptJob,
  PromptFile,
  JobStatus,
  WsMessage,
  TemplateType,
  PromptOptions,
} from "../src/lib/types.js";

// ── Config ───────────────────────────────────────────────────────────────────
const PORT = 3001;
const PROMPTS_DIR = path.resolve(".prompts");
const OUTPUT_DIR = path.resolve("out");
const PUBLIC_DIR = path.resolve("public");

// Ensure directories exist
[PROMPTS_DIR, OUTPUT_DIR, PUBLIC_DIR].forEach((dir) =>
  fs.mkdirSync(dir, { recursive: true })
);

// ── In-memory job store ──────────────────────────────────────────────────────
const jobs = new Map<string, PromptJob>();

function createJob(
  prompt: string,
  template: TemplateType,
  options: PromptOptions
): PromptJob {
  const id = uuidv4().slice(0, 8);
  const now = new Date().toISOString();
  const job: PromptJob = {
    id,
    prompt,
    template,
    options,
    status: "queued",
    progress: 0,
    statusMessage: "Prompt submitted — waiting for Antigravity agent...",
    compositionId: null,
    videoUrl: null,
    createdAt: now,
    updatedAt: now,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

function updateJob(
  id: string,
  updates: Partial<PromptJob>
): PromptJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Serve rendered videos
app.use("/out", express.static(OUTPUT_DIR));
// Serve public assets
app.use("/public", express.static(PUBLIC_DIR));

// ── API Routes ───────────────────────────────────────────────────────────────

/** Health check */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/** Submit a new prompt */
app.post("/api/prompt", (req, res) => {
  const { prompt, template = "custom", options = {} } = req.body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const job = createJob(prompt.trim(), template, options);

  // Write prompt file for Antigravity agent
  const promptFile: PromptFile = {
    id: job.id,
    prompt: job.prompt,
    template: job.template,
    options: job.options,
    createdAt: job.createdAt,
  };

  const promptPath = path.join(PROMPTS_DIR, `${job.id}.json`);
  fs.writeFileSync(promptPath, JSON.stringify(promptFile, null, 2));

  console.log(`📝 Prompt written: ${promptPath}`);

  // Also write a human-readable version for easy copy-paste into Antigravity
  const readablePath = path.join(PROMPTS_DIR, `${job.id}.md`);
  const readableContent = `# Video Generation Prompt

**Job ID:** ${job.id}
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
3. Fetch/generate background images
4. Create the composition in \`src/remotion/\` or use the generic PromptVideo with a timeline
5. Write output to \`public/content/${job.id}/\`
6. When done, create \`.prompts/${job.id}.done\` to signal completion
`;
  fs.writeFileSync(readablePath, readableContent);

  res.status(201).json(job);
});

/** Get all jobs */
app.get("/api/jobs", (_req, res) => {
  const allJobs = Array.from(jobs.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(allJobs);
});

/** Get a specific job */
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

/** Get the clipboard-ready prompt for manual Antigravity paste */
app.get("/api/jobs/:id/clipboard", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const clipboardText = `Generate a ${job.template} video with the following prompt:

"${job.prompt}"

Requirements:
- Create a Remotion composition with multiple scenes
- Generate voiceover per scene using ElevenLabs
- Generate/fetch background images per scene
- Write timeline.json to public/content/${job.id}/timeline.json
- Write audio to public/content/${job.id}/voice.mp3
- After all assets are ready, create .prompts/${job.id}.done

Job ID: ${job.id}
Template: ${job.template}
Options: ${JSON.stringify(job.options)}`;

  res.json({ text: clipboardText });
});

/** Manually mark a job as processing (for testing) */
app.post("/api/jobs/:id/status", (req, res) => {
  const { status, progress, message } = req.body;
  const job = updateJob(req.params.id, {
    status,
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

/** Manually mark a job as done with a video path (for testing) */
app.post("/api/jobs/:id/complete", (req, res) => {
  const { videoPath } = req.body;
  const job = updateJob(req.params.id, {
    status: "done",
    progress: 100,
    statusMessage: "Video ready!",
    videoUrl: videoPath || `/out/${req.params.id}.mp4`,
  });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  broadcastWs({
    type: "done",
    jobId: job.id,
    videoUrl: job.videoUrl!,
  });
  res.json(job);
});

// ── WebSocket ────────────────────────────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const wsClients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  wsClients.add(ws);
  console.log(`🔌 WebSocket client connected (${wsClients.size} total)`);

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

// ── File Watcher — detect .done signals from Antigravity agent ───────────────
const watcher = watch(PROMPTS_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500 },
});

watcher.on("add", async (filePath: string) => {
  const basename = path.basename(filePath);

  // Watch for .done files
  if (basename.endsWith(".done")) {
    const jobId = basename.replace(".done", "");
    console.log(`✅ Done signal received for job: ${jobId}`);

    const job = updateJob(jobId, {
      status: "rendering",
      progress: 70,
      statusMessage: "Agent finished — preparing video...",
      compositionId: jobId,
    });

    if (job) {
      broadcastWs({
        type: "status",
        jobId,
        status: "rendering",
        progress: 70,
        message: "Agent finished — preparing video...",
      });

      // Check if the rendered video already exists
      const videoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
      if (fs.existsSync(videoPath)) {
        const updatedJob = updateJob(jobId, {
          status: "done",
          progress: 100,
          statusMessage: "Video ready!",
          videoUrl: `/out/${jobId}.mp4`,
        });
        broadcastWs({
          type: "done",
          jobId,
          videoUrl: `/out/${jobId}.mp4`,
        });
        console.log(`🎬 Video ready: ${videoPath}`);
      } else {
        // Mark as done with a note that rendering needs to be triggered
        const updatedJob = updateJob(jobId, {
          status: "done",
          progress: 100,
          statusMessage:
            "Assets ready! Run `npx remotion render` to produce the final video.",
          videoUrl: null,
        });
        broadcastWs({
          type: "status",
          jobId,
          status: "done",
          progress: 100,
          message:
            "Assets ready! Run `npx remotion render` to produce the final video.",
        });
      }
    }
  }

  // Watch for status update files (agent can write these)
  if (basename.endsWith(".status.json")) {
    const jobId = basename.replace(".status.json", "");
    try {
      const statusData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const job = updateJob(jobId, {
        status: statusData.status || "processing",
        progress: statusData.progress || 50,
        statusMessage:
          statusData.message || "Agent is working on your video...",
      });
      if (job) {
        broadcastWs({
          type: "status",
          jobId,
          status: job.status,
          progress: job.progress,
          message: job.statusMessage,
        });
      }
    } catch {
      // Ignore malformed status files
    }
  }
});

// Also watch for status changes (updates to existing files)
watcher.on("change", async (filePath: string) => {
  const basename = path.basename(filePath);
  if (basename.endsWith(".status.json")) {
    const jobId = basename.replace(".status.json", "");
    try {
      const statusData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const job = updateJob(jobId, {
        status: statusData.status || "processing",
        progress: statusData.progress || 50,
        statusMessage:
          statusData.message || "Agent is working on your video...",
      });
      if (job) {
        broadcastWs({
          type: "status",
          jobId,
          status: job.status,
          progress: job.progress,
          message: job.statusMessage,
        });
      }
    } catch {
      // Ignore malformed status files
    }
  }
});

console.log(`👀 Watching ${PROMPTS_DIR} for agent signals...`);

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  🎬 Remotion Prompt Studio — Server             ║
║                                                  ║
║  API:       http://localhost:${PORT}/api            ║
║  WebSocket: ws://localhost:${PORT}/ws               ║
║  Videos:    http://localhost:${PORT}/out             ║
╚══════════════════════════════════════════════════╝
  `);
});
