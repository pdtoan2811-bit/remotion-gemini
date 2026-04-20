---
name: prompt-watcher
description: Watches the .prompts/ directory for new video generation requests submitted via the Remotion Prompt Studio UI. When a new prompt file appears, this skill defines the workflow for generating all video assets and signaling completion.
---

# Prompt Watcher — Antigravity Agent Skill

This skill handles video generation requests submitted through the Remotion Prompt Studio web UI.

## Direct Integration (MCP Bridge)

This project includes an MCP server registered in Antigravity's `mcp_config.json`. The agent has these tools:

| MCP Tool | Purpose |
|---|---|
| `get_pending_prompts` | Check for new prompts from the UI |
| `get_prompt_details` | Get full details + instructions for a job |
| `update_job_status` | Push status/progress to the UI in real-time |
| `complete_job` | Signal completion — UI shows "done" instantly |

### Workflow with MCP Tools

```
1. Call get_pending_prompts → see what the user submitted
2. Call get_prompt_details(job_id) → read the full prompt
3. Call update_job_status(job_id, "processing", 10, "Generating script...") → UI updates live
4. ... do the work (generate script, voiceover, images, timeline) ...
5. Call update_job_status(job_id, "processing", 60, "Rendering scene 4/6...")
6. Call complete_job(job_id) → UI shows ✅ complete
```

The UI updates **instantly** via WebSocket — no polling, no file watching delay.

## Trigger

A new `.json` file appears in the `.prompts/` directory. Each file contains:

```json
{
  "id": "abc12345",
  "prompt": "Breaking: SpaceX launches first Mars colony ship",
  "template": "news-short",
  "options": {
    "sceneCount": 6,
    "style": "kinetic"
  },
  "createdAt": "2026-04-20T15:00:00Z"
}
```

## Workflow

When you detect a new prompt (via MCP `get_pending_prompts` or file watcher):

### Step 1: Read the prompt
Call `get_prompt_details(job_id)` or read `.prompts/{id}.json` directly.

### Step 2: Update status
```
Call: update_job_status(job_id, "processing", 10, "Generating scene script...")
```

### Step 3: Generate scene script
Based on the prompt and template type, generate a multi-scene script. Each scene needs:
- `id`: Unique scene identifier (e.g., `s1-hook`, `s2-context`)
- `caption`: The text displayed on screen (use `\n` for line breaks)
- `tag`: Short badge label (e.g., `🔥 BREAKING`, `📊 DATA`)
- `voiceoverText`: The full text for TTS generation
- `imageDescription`: Description for AI image generation

### Step 4: Generate voiceover
```
Call: update_job_status(job_id, "processing", 30, "Generating voiceover...")
```
For each scene, generate ElevenLabs TTS audio:
- Save to `public/content/{id}/{sceneId}/voice.mp3`
- Use the word-timestamp API if available for subtitle sync

### Step 5: Generate/fetch images
```
Call: update_job_status(job_id, "processing", 50, "Generating images...")
```
For each scene, generate or fetch a background image:
- Save to `public/content/{id}/{sceneId}/bg.png`
- Portrait orientation (1080×1920) preferred

### Step 6: Create timeline.json
```
Call: update_job_status(job_id, "processing", 70, "Building timeline...")
```
Write the complete timeline to `public/content/{id}/timeline.json`:

```json
{
  "scenes": [
    {
      "id": "s1-hook",
      "caption": "Breaking news\nfrom the frontier",
      "tag": "🔥 BREAKING",
      "voiceoverText": "Breaking news from the frontier of space exploration.",
      "imageDescription": "SpaceX rocket launching into orange sunset sky",
      "audioDurationFrames": 90
    }
  ],
  "totalDurationFrames": 540
}
```

### Step 7: Signal completion
```
Call: complete_job(job_id, "out/{id}.mp4")
```

## Template Guidelines

### news-short
- 6-8 scenes, aggressive pacing
- First scene = hook (question or shocking stat)
- Last scene = CTA
- Tags: 🔥 BREAKING, 📊 DATA, 🌍 GLOBAL, etc.

### documentary
- 6-10 scenes, measured pacing
- Formal tone, broadcast-style
- Tags: 📅 DATE, 📍 LOCATION, 📰 REPORT, etc.

### ai-summary
- 5-8 scenes, explainer format
- Technical but accessible
- Tags: 🤖 AI, 🧠 HOW, ⚡ IMPACT, etc.

### custom
- Follow the prompt's own structure
- Adapt scene count and pacing to content

## Important Notes

- All audio/image paths are relative to `public/`
- The PromptVideo composition at `src/remotion/PromptVideo.tsx` renders from the timeline
- FPS is 30, resolution is 1080×1920
- MCP tools push status updates to the UI in real-time via the Express server's WebSocket
- The `.done` file is also written as a fallback when using `complete_job`
