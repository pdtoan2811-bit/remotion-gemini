import { useState, useEffect, useCallback, useRef } from "react";
import type { PromptJob, WsMessage } from "../lib/types";
import { PromptPanel } from "./components/PromptPanel";
import { VideoPlayer } from "./components/VideoPlayer";
import { JobHistory } from "./components/JobHistory";
import { StatusBar } from "./components/StatusBar";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<PromptJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  // ── Fetch existing jobs on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data: PromptJob[]) => {
        setJobs(data);
        if (data.length > 0) setActiveJobId(data[0].id);
      })
      .catch(() => {
        // Server not yet running
      });
  }, []);

  // ── WebSocket for real-time updates ───────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg: WsMessage = JSON.parse(event.data);

        setJobs((prev) =>
          prev.map((job) => {
            if (job.id !== msg.jobId) return job;

            switch (msg.type) {
              case "status":
                return {
                  ...job,
                  status: msg.status,
                  progress: msg.progress,
                  statusMessage: msg.message,
                  updatedAt: new Date().toISOString(),
                };
              case "done":
                return {
                  ...job,
                  status: "done",
                  progress: 100,
                  statusMessage: "Video ready!",
                  videoUrl: msg.videoUrl,
                  updatedAt: new Date().toISOString(),
                };
              case "error":
                return {
                  ...job,
                  status: "error",
                  statusMessage: msg.error,
                  error: msg.error,
                  updatedAt: new Date().toISOString(),
                };
              default:
                return job;
            }
          })
        );
      };

      ws.onclose = () => {
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // ── Submit prompt ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (prompt: string, template: string, options: Record<string, unknown>) => {
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, template, options }),
        });

        if (!response.ok) throw new Error("Failed to submit prompt");

        const job: PromptJob = await response.json();
        setJobs((prev) => [job, ...prev]);
        setActiveJobId(job.id);
      } catch (err) {
        console.error("Submit error:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  // ── Copy to clipboard (manual Antigravity fallback) ───────────────────────
  const handleCopyClipboard = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/clipboard`);
      const data = await response.json();
      await navigator.clipboard.writeText(data.text);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="app-layout">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__logo">
          <div className="app-header__icon">🎬</div>
          <div>
            <div className="app-header__title">Remotion Prompt Studio</div>
            <div className="app-header__subtitle">
              AI Video Generation × Antigravity
            </div>
          </div>
        </div>
        <div className="app-header__status">
          <span className="status-dot" />
          Server Connected
        </div>
      </header>

      {/* ── Left Sidebar: Job History ───────────────────────────────────── */}
      <aside className="sidebar-left">
        <JobHistory
          jobs={jobs}
          activeJobId={activeJobId}
          onSelectJob={setActiveJobId}
        />
      </aside>

      {/* ── Center: Video Player ────────────────────────────────────────── */}
      <main className="main-content">
        <VideoPlayer
          job={activeJob}
          onCopyClipboard={handleCopyClipboard}
        />
        {activeJob && (
          <StatusBar job={activeJob} />
        )}
      </main>

      {/* ── Right Sidebar: Prompt Panel ─────────────────────────────────── */}
      <aside className="sidebar-right">
        <PromptPanel
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </aside>
    </div>
  );
};
