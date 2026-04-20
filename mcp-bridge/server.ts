#!/usr/bin/env node

/**
 * Remotion Prompt Studio — MCP Bridge Server
 *
 * An MCP (Model Context Protocol) server that bridges the web UI
 * with the Antigravity IDE agent. Runs as a stdio MCP server.
 *
 * Exposes tools:
 * - get_pending_prompts: Returns prompts waiting for agent processing
 * - get_prompt_details: Get full details of a specific prompt
 * - update_job_status: Update status/progress for the UI
 * - complete_job: Signal that a job is done
 *
 * Also exposes a resource for the current prompt queue state.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "..", ".prompts");
const SERVER_URL = "http://localhost:3001";

// ── Ensure prompts directory exists ──────────────────────────────────────────
fs.mkdirSync(PROMPTS_DIR, { recursive: true });

// ── MCP Protocol Types ───────────────────────────────────────────────────────
interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPendingPrompts(): Array<{
  id: string;
  prompt: string;
  template: string;
  options: Record<string, unknown>;
  createdAt: string;
}> {
  if (!fs.existsSync(PROMPTS_DIR)) return [];

  const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".status.json"));
  const pending: Array<{
    id: string;
    prompt: string;
    template: string;
    options: Record<string, unknown>;
    createdAt: string;
  }> = [];

  for (const file of files) {
    const id = file.replace(".json", "");
    const donePath = path.join(PROMPTS_DIR, `${id}.done`);

    // Skip already completed jobs
    if (fs.existsSync(donePath)) continue;

    try {
      const content = JSON.parse(
        fs.readFileSync(path.join(PROMPTS_DIR, file), "utf-8")
      );
      pending.push(content);
    } catch {
      // Skip malformed files
    }
  }

  return pending.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  message: string
): boolean {
  try {
    // Write status file for the Express server's file watcher
    const statusPath = path.join(PROMPTS_DIR, `${jobId}.status.json`);
    fs.writeFileSync(
      statusPath,
      JSON.stringify({ status, progress, message }, null, 2)
    );

    // Also notify Express server directly via HTTP
    fetch(`${SERVER_URL}/api/jobs/${jobId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress, message }),
    }).catch(() => {
      // Server might not be running, file-based fallback works
    });

    return true;
  } catch {
    return false;
  }
}

function completeJob(jobId: string, videoPath?: string): boolean {
  try {
    // Write done signal
    const donePath = path.join(PROMPTS_DIR, `${jobId}.done`);
    fs.writeFileSync(donePath, "done");

    // Notify Express server directly
    fetch(`${SERVER_URL}/api/jobs/${jobId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoPath }),
    }).catch(() => {
      // File-based fallback works via chokidar watcher
    });

    return true;
  } catch {
    return false;
  }
}

// ── MCP Tool Definitions ─────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_pending_prompts",
    description:
      "Get all pending video generation prompts from the Remotion Prompt Studio UI. Returns prompts that have been submitted but not yet completed. Call this to check for new work.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_prompt_details",
    description:
      "Get the full details and human-readable instructions for a specific prompt job. Returns the prompt text, template type, and a markdown guide for generating the video.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to get details for",
        },
      },
      required: ["job_id"],
    },
  },
  {
    name: "update_job_status",
    description:
      "Update the status and progress of a video generation job. The UI will show this in real-time via WebSocket. Call this at each major step to keep the user informed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to update",
        },
        status: {
          type: "string",
          enum: ["processing", "rendering"],
          description: "Current status of the job",
        },
        progress: {
          type: "number",
          description: "Progress percentage (0-100)",
        },
        message: {
          type: "string",
          description:
            "Human-readable status message shown in the UI (e.g., 'Generating voiceover for scene 3...')",
        },
      },
      required: ["job_id", "status", "progress", "message"],
    },
  },
  {
    name: "complete_job",
    description:
      "Mark a video generation job as complete. This signals the UI that the video is ready. Call this after all assets have been generated and the video has been rendered.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to complete",
        },
        video_path: {
          type: "string",
          description:
            "Optional path to the rendered video file (relative to project root, e.g., 'out/abc123.mp4')",
        },
      },
      required: ["job_id"],
    },
  },
];

// ── MCP Message Handler ──────────────────────────────────────────────────────
function handleMessage(msg: JsonRpcMessage): JsonRpcMessage | null {
  if (!msg.method) return null;

  switch (msg.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: "remotion-prompt-studio",
            version: "1.0.0",
          },
        },
      };

    case "notifications/initialized":
      // No response needed for notifications
      return null;

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOLS },
      };

    case "tools/call": {
      const toolName = (msg.params as { name: string })?.name;
      const args = (msg.params as { arguments?: Record<string, unknown> })
        ?.arguments ?? {};

      switch (toolName) {
        case "get_pending_prompts": {
          const pending = getPendingPrompts();
          const summary =
            pending.length === 0
              ? "No pending prompts. The queue is empty."
              : `Found ${pending.length} pending prompt(s):\n\n${pending
                  .map(
                    (p, i) =>
                      `${i + 1}. **[${p.id}]** (${p.template}): "${p.prompt.slice(0, 100)}${p.prompt.length > 100 ? "..." : ""}"`
                  )
                  .join("\n")}`;

          return {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [
                {
                  type: "text",
                  text: summary,
                },
                {
                  type: "text",
                  text: JSON.stringify(pending, null, 2),
                },
              ],
            },
          };
        }

        case "get_prompt_details": {
          const jobId = args.job_id as string;
          const promptPath = path.join(PROMPTS_DIR, `${jobId}.json`);
          const mdPath = path.join(PROMPTS_DIR, `${jobId}.md`);

          if (!fs.existsSync(promptPath)) {
            return {
              jsonrpc: "2.0",
              id: msg.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Error: No prompt found with ID "${jobId}"`,
                  },
                ],
                isError: true,
              },
            };
          }

          const promptData = fs.readFileSync(promptPath, "utf-8");
          const mdContent = fs.existsSync(mdPath)
            ? fs.readFileSync(mdPath, "utf-8")
            : "No markdown instructions available.";

          return {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [
                { type: "text", text: mdContent },
                { type: "text", text: `\n\nRaw prompt data:\n${promptData}` },
              ],
            },
          };
        }

        case "update_job_status": {
          const success = updateJobStatus(
            args.job_id as string,
            args.status as string,
            args.progress as number,
            args.message as string
          );
          return {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [
                {
                  type: "text",
                  text: success
                    ? `Status updated for job ${args.job_id}: ${args.status} (${args.progress}%) — ${args.message}`
                    : `Failed to update status for job ${args.job_id}`,
                },
              ],
            },
          };
        }

        case "complete_job": {
          const success = completeJob(
            args.job_id as string,
            args.video_path as string | undefined
          );
          return {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [
                {
                  type: "text",
                  text: success
                    ? `Job ${args.job_id} marked as complete! The UI has been notified.`
                    : `Failed to complete job ${args.job_id}`,
                },
              ],
            },
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id: msg.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`,
            },
          };
      }
    }

    case "resources/list":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          resources: [
            {
              uri: "prompt-studio://queue",
              name: "Prompt Queue",
              description:
                "Current state of the video generation prompt queue",
              mimeType: "application/json",
            },
          ],
        },
      };

    case "resources/read": {
      const uri = (msg.params as { uri: string })?.uri;
      if (uri === "prompt-studio://queue") {
        const pending = getPendingPrompts();
        return {
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            contents: [
              {
                uri: "prompt-studio://queue",
                mimeType: "application/json",
                text: JSON.stringify({ pending, count: pending.length }, null, 2),
              },
            ],
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32602, message: `Unknown resource: ${uri}` },
      };
    }

    default:
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32601,
          message: `Method not found: ${msg.method}`,
        },
      };
  }
}

// ── Stdio Transport ──────────────────────────────────────────────────────────
let buffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;

  // Process complete messages (Content-Length header + JSON body)
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) break; // Wait for more data

    const body = buffer.slice(bodyStart, bodyEnd);
    buffer = buffer.slice(bodyEnd);

    try {
      const message: JsonRpcMessage = JSON.parse(body);
      const response = handleMessage(message);

      if (response) {
        const responseStr = JSON.stringify(response);
        const responseBytes = Buffer.byteLength(responseStr, "utf-8");
        process.stdout.write(
          `Content-Length: ${responseBytes}\r\n\r\n${responseStr}`
        );
      }
    } catch (err) {
      // Log to stderr (visible in Antigravity's MCP output)
      process.stderr.write(`MCP parse error: ${err}\n`);
    }
  }
});

process.stderr.write("🔌 Remotion Prompt Studio MCP server started\n");
