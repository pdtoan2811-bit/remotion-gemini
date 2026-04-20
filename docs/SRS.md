# Remotion Prompt Studio — Software Requirements Specification

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Remotion Prompt Studio                         │
├──────────────┬──────────────────────┬───────────────────────────┤
│  Vite UI     │  Express Server      │  Remotion Engine          │
│  (React)     │  (Node.js)           │  (SSR Renderer)           │
│  port: 5173  │  port: 3001          │  port: 3000 (Studio)      │
├──────────────┼──────────────────────┼───────────────────────────┤
│ App.tsx      │ server.ts            │ Root.tsx                  │
│ PromptPanel  │ - REST API           │ PromptVideo.tsx           │
│ VideoPlayer  │ - WebSocket ◄────┐   │ - Grain, LightLeak        │
│ JobHistory   │ - File watcher   │   │ - Particles               │
│ StatusBar    │ - Static server  │   │ - KineticOverlay          │
│              │                  │   │ - TagBadge, CaptionBlock  │
└──────┬───────┴──────────┬───────┼───┴───────────────────────────┘
       │                  │       │
       │  HTTP/WS         │       │ HTTP POST (status/complete)
       │                  │       │
       └──────────────────┤       │
                          │       │
                    ┌─────▼──────┐│     ┌───────────────────────┐
                    │ .prompts/  ││     │  MCP Bridge Server    │
                    │ {id}.json  │├────►│  (stdio transport)    │
                    │ {id}.done  ││     │                       │
                    └────────────┘│     │  Tools:               │
                                  │     │  • get_pending_prompts │
                                  │     │  • get_prompt_details  │
                                  └────►│  • update_job_status   │
                                        │  • complete_job        │
                                        └───────────┬───────────┘
                                                    │ stdio
                                              ┌─────▼──────┐
                                              │ Antigravity │
                                              │ IDE Agent   │
                                              └─────────────┘
```

### 1.1 MCP Bridge (Direct Integration)

The MCP Bridge server (`mcp-bridge/server.ts`) provides **direct port-based integration** between the web UI and the Antigravity IDE agent. It is registered in `~/.gemini/antigravity/mcp_config.json` and launched automatically by Antigravity.

| MCP Tool | Direction | Description |
|---|---|---|
| `get_pending_prompts` | Agent ← UI | Returns all unprocessed prompts from the queue |
| `get_prompt_details` | Agent ← UI | Gets full prompt data + instructions for a job |
| `update_job_status` | Agent → UI | Pushes real-time status to the Express server → WebSocket → UI |
| `complete_job` | Agent → UI | Signals completion, writes `.done` file, notifies UI |

The `update_job_status` and `complete_job` tools make HTTP POST calls to the Express server on port 3001, which broadcasts to all connected WebSocket clients immediately.

## 2. Component Specifications

### 2.1 Express Server (`server/server.ts`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/prompt` | POST | Submit new prompt → writes `.prompts/{id}.json` |
| `/api/jobs` | GET | List all jobs (sorted newest first) |
| `/api/jobs/:id` | GET | Get specific job details |
| `/api/jobs/:id/clipboard` | GET | Get clipboard-ready prompt text |
| `/api/jobs/:id/status` | POST | Manually update job status |
| `/api/jobs/:id/complete` | POST | Manually mark job as done |
| `/ws` | WS | Real-time status updates |
| `/out/*` | STATIC | Serve rendered video files |
| `/public/*` | STATIC | Serve assets (images, audio) |

### 2.2 File-Based Protocol

#### Prompt File (`.prompts/{id}.json`)
```typescript
interface PromptFile {
  id: string;
  prompt: string;
  template: "news-short" | "documentary" | "ai-summary" | "custom";
  options: {
    sceneCount?: number;
    style?: "kinetic" | "formal" | "minimal";
    voiceId?: string;
  };
  createdAt: string; // ISO 8601
}
```

#### Status File (`.prompts/{id}.status.json`)
```typescript
interface StatusUpdate {
  status: "processing" | "rendering";
  progress: number; // 0-100
  message: string;
}
```

#### Done Signal (`.prompts/{id}.done`)
Plain text file. Existence signals completion.

### 2.3 Timeline Data Model (`public/content/{id}/timeline.json`)
```typescript
interface Timeline {
  scenes: Scene[];
  wordTimings?: WordTiming[][];
  totalDurationFrames: number;
}

interface Scene {
  id: string;
  caption: string;
  tag: string;
  voiceoverText: string;
  imageDescription: string;
  audioDurationFrames?: number;
}
```

### 2.4 WebSocket Messages
```typescript
type WsMessage =
  | { type: "status"; jobId: string; status: JobStatus; progress: number; message: string }
  | { type: "done"; jobId: string; videoUrl: string }
  | { type: "error"; jobId: string; error: string };
```

### 2.5 PromptVideo Composition (`src/remotion/PromptVideo.tsx`)

Visual layers (bottom to top):
1. **Background** — AI-generated image with Ken Burns zoom + gradient fallback
2. **KineticOverlay** — Slow-drifting radial gradient in accent color
3. **Particles** — 14 floating dots with varying speed/opacity
4. **TagBadge** — Scene label + counter badge (spring-animated entry)
5. **CaptionBlock** — Word-by-word spring reveal in glassmorphic card
6. **LightLeak** — Radial flash on scene cuts (12-frame decay)
7. **Grain** — Animated SVG noise overlay

Animation constants:
- Spring stiffness: 380 (captions), 440 (badges), 320 (panels)
- Easing: `Easing.bezier(0.1, 1, 0, 1)` — hostile easing
- Word reveal delay: 4 frames between words
- No CSS animations — all driven by `useCurrentFrame()`

## 3. Directory Structure

```
remotion/
├── .agents/skills/prompt-watcher/SKILL.md  # Agent skill definition
├── .prompts/                               # Job files (gitignored)
├── docs/
│   ├── BRD.md
│   ├── PRD.md
│   └── SRS.md                              # This file
├── mcp-bridge/
│   └── server.ts                            # MCP server (direct Antigravity integration)
├── out/                                     # Rendered videos
├── public/
│   └── content/{id}/                        # Per-job assets
│       ├── timeline.json
│       ├── {sceneId}/bg.png
│       └── {sceneId}/voice.mp3
├── server/
│   └── server.ts                            # Express + WebSocket
├── src/
│   ├── index.ts                             # Remotion entry
│   ├── lib/
│   │   ├── constants.ts
│   │   └── types.ts
│   ├── remotion/
│   │   ├── Root.tsx                         # Composition registry
│   │   └── PromptVideo.tsx                  # Generic video composition
│   └── ui/
│       ├── App.tsx                          # Main UI layout
│       ├── index.css                        # Design system
│       ├── main.tsx                         # Vite entry
│       └── components/
│           ├── JobHistory.tsx
│           ├── PromptPanel.tsx
│           ├── StatusBar.tsx
│           └── VideoPlayer.tsx
├── index.html                               # Vite HTML entry
├── package.json
├── remotion.config.ts
├── tsconfig.json
└── vite.config.ts
```

## 4. Development Commands

| Command | Description |
|---|---|
| `npm run start` | Start both Express server + Vite UI (concurrent) |
| `npm run server` | Start Express server only (port 3001) |
| `npm run ui` | Start Vite UI only (port 5173) |
| `npm run studio` | Start Remotion Studio (port 3000) |
| `npm run render` | Render video via Remotion CLI |
