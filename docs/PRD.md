# Remotion Prompt Studio — Product Requirements Document

## 1. Overview

Remotion Prompt Studio is a web-based interface for generating short-form videos from text prompts. It connects to the Antigravity IDE agent to handle code generation, asset creation, and composition building — then renders the final video using Remotion's deterministic rendering pipeline.

## 2. User Flow

```
User opens Prompt Studio UI (localhost:5173)
         ↓
   Selects template + types prompt
         ↓
   Clicks "Generate Video"
         ↓
   Express server writes .prompts/{id}.json
         ↓
   Antigravity agent detects prompt file
         ↓
   Agent generates:
   ├── Scene script (via LLM)
   ├── Voiceover audio (via ElevenLabs)
   ├── Background images (via AI/Tavily)
   └── Timeline JSON
         ↓
   Agent writes .prompts/{id}.done
         ↓
   Server detects completion → notifies UI via WebSocket
         ↓
   User renders video (manual or auto)
         ↓
   Video plays in UI player
```

**Manual fallback**: User can click "📋 Copy Prompt" to get a clipboard-ready prompt and paste it into Antigravity's chat manually.

## 3. Features

### F1: Prompt Studio Web UI
- **Behavior**: Three-panel layout — job history (left), video player (center), prompt input (right)
- **Design**: Premium dark theme, glassmorphism, Inter font, micro-animations
- **Port**: localhost:5173 (Vite dev server)

### F2: Template Selection
- **Behavior**: Dropdown with 4 templates — News Short, Documentary, AI Summary, Custom
- **Each template**: Adjusts scene count, tone, pacing, and visual style

### F3: Prompt Submission
- **Behavior**: User types prompt → clicks Generate → server creates `.prompts/{id}.json`
- **Validation**: Non-empty prompt required
- **Keyboard shortcut**: ⌘+Enter / Ctrl+Enter to submit

### F4: Real-time Status Updates
- **Behavior**: WebSocket connection streams job status from server
- **Progress bar**: 0-100% with step indicators (Submitted → Processing → Rendering → Complete)
- **Status messages**: Agent writes `.status.json` files for granular updates

### F5: Video Playback
- **Behavior**: Rendered MP4 plays in 9:16 portrait player with controls
- **Download**: Button to download the rendered video
- **Fallback**: Shows processing indicator icons while agent works

### F6: Job History
- **Behavior**: Left sidebar lists all past generation jobs
- **Status badges**: Color-coded dots (queued=yellow, processing=purple, rendering=blue, done=green, error=red)
- **Click to load**: Selecting a job shows its video/status in the player

### F7: Manual Clipboard Fallback
- **Behavior**: "Copy Prompt" button generates a ready-to-paste prompt for Antigravity
- **Purpose**: Works even without file-watcher automation

### F8: Express Backend
- **Behavior**: REST API + WebSocket on port 3001
- **Endpoints**: POST /api/prompt, GET /api/jobs, GET /api/jobs/:id, GET /api/jobs/:id/clipboard
- **File watcher**: Chokidar watches `.prompts/` for `.done` and `.status.json` signals

## 4. Technical Constraints

- All Remotion animations driven by `useCurrentFrame()` — no CSS animations
- Assets referenced via `staticFile()` from `public/` folder
- Server and UI run concurrently via `concurrently` package
- Vite proxies `/api` and `/ws` to Express on port 3001

## 5. Environment Variables

| Variable | Required | Provider |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for script generation) | OpenAI |
| `ELEVENLABS_API_KEY` | Yes (for voiceover) | ElevenLabs |
| `TAVILY_API_KEY` | Optional (for news images) | Tavily |
