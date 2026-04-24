import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PromptJob,
  ReadinessStatus,
  Timeline,
  Scene,
  WsMessage,
  VideoProject,
} from "../lib/types";
import { PromptPanel } from "./components/PromptPanel";
import { VideoPlayer } from "./components/VideoPlayer";
import { SceneTimeline } from "./components/SceneTimeline";
import { JobHistory } from "./components/JobHistory";
import { StatusBar } from "./components/StatusBar";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<PromptJob[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const activeJob = jobs.find((job) => job.id === activeJobId) ?? null;

  const refreshProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) return;
      const data: VideoProject[] = await response.json();
      setProjects(data);
    } catch {
      // Server may be offline
    }
  }, []);

  useEffect(() => {
    Promise.all([fetch("/api/jobs"), fetch("/api/projects")])
      .then(async ([jobsResponse, projectsResponse]) => {
        const loadedJobs: PromptJob[] = jobsResponse.ok
          ? await jobsResponse.json()
          : [];
        const loadedProjects: VideoProject[] = projectsResponse.ok
          ? await projectsResponse.json()
          : [];

        setJobs(loadedJobs);
        setProjects(loadedProjects);
        if (loadedJobs.length > 0) setActiveJobId(loadedJobs[0].id);
      })
      .catch(() => {
        // Server not running yet
      });
  }, []);

  useEffect(() => {
    if (!activeJob) {
      setTimeline(null);
      setSelectedScene(null);
      return;
    }

    if (activeJob.status === "done" || activeJob.compositionId) {
      fetch(`/api/jobs/${activeJob.id}/timeline`)
        .then((response) => {
          if (!response.ok) throw new Error("Timeline not found");
          return response.json();
        })
        .then((data: Timeline) => {
          setTimeline(data);
        })
        .catch(() => {
          setTimeline(null);
        });
    } else {
      setTimeline(null);
    }

    setSelectedScene(null);
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    let mounted = true;

    const pollReadiness = async () => {
      try {
        const response = await fetch("/api/readiness");
        if (!response.ok) throw new Error("Readiness request failed");
        const data: ReadinessStatus = await response.json();
        if (mounted) setReadiness(data);
      } catch {
        if (mounted) {
          setReadiness({
            canPrompt: false,
            summary: "Server unreachable. Start backend services first.",
            checks: {
              serverOnline: false,
              mcpBridgeOnline: false,
              antigravityAttached: false,
            },
            heartbeat: {
              heartbeatAt: null,
              heartbeatAgeSec: null,
              requestCount: 0,
              lastRequestAt: null,
            },
          });
        }
      }
    };

    void pollReadiness();
    const interval = setInterval(pollReadiness, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const message: WsMessage = JSON.parse(event.data);

        setJobs((previousJobs) =>
          previousJobs.map((job) => {
            if (job.id !== message.jobId) return job;

            switch (message.type) {
              case "status":
                return {
                  ...job,
                  status: message.status,
                  progress: message.progress,
                  statusMessage: message.message,
                  updatedAt: new Date().toISOString(),
                };
              case "done":
                return {
                  ...job,
                  status: "done",
                  progress: 100,
                  statusMessage: "Video ready!",
                  videoUrl: message.videoUrl,
                  updatedAt: new Date().toISOString(),
                };
              case "error":
                return {
                  ...job,
                  status: "error",
                  statusMessage: message.error,
                  error: message.error,
                  updatedAt: new Date().toISOString(),
                };
              default:
                return job;
            }
          })
        );
      };

      ws.onclose = () => {
        setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

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
        setJobs((previousJobs) => [job, ...previousJobs]);
        setActiveJobId(job.id);
        setSelectedScene(null);
        await refreshProjects();
      } catch (error) {
        console.error("Submit error:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshProjects]
  );

  const handleCreateProject = useCallback(
    async (name: string, description?: string): Promise<VideoProject | null> => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        if (!response.ok) return null;
        const createdProject: VideoProject = await response.json();
        setProjects((prev) => [createdProject, ...prev]);
        return createdProject;
      } catch {
        return null;
      } finally {
        void refreshProjects();
      }
    },
    [refreshProjects]
  );

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

  const handleReusePrompt = useCallback((prompt: string) => {
    const input = document.getElementById("prompt-input") as HTMLTextAreaElement | null;
    if (!input) return;

    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, prompt);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleNewVideo = useCallback(() => {
    setActiveJobId(null);
    setTimeline(null);
    setSelectedScene(null);
    setTimeout(() => {
      const input = document.getElementById("prompt-input") as HTMLTextAreaElement | null;
      input?.focus();
    }, 100);
  }, []);

  const handleRenderVideo = useCallback(async (jobId: string) => {
    setIsRendering(true);
    try {
      await fetch(`/api/jobs/${jobId}/render`, { method: "POST" });
    } catch (error) {
      console.error("Render error:", error);
    } finally {
      setTimeout(() => setIsRendering(false), 2000);
    }
  }, []);

  const statusTone = !readiness
    ? "waiting"
    : readiness.canPrompt
      ? "ready"
      : readiness.checks.mcpBridgeOnline
        ? "waiting"
        : "offline";

  const statusText = !readiness
    ? "Checking readiness..."
    : readiness.canPrompt
      ? "Antigravity Ready"
      : readiness.checks.mcpBridgeOnline
        ? "Waiting for Antigravity"
        : readiness.checks.serverOnline === false
          ? "Server Offline"
          : "MCP Bridge Offline";

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__logo">
          <div className="app-header__icon">🎬</div>
          <div>
            <div className="app-header__title">Remotion Prompt Studio</div>
            <div className="app-header__subtitle">AI Video Generation x Antigravity</div>
          </div>
        </div>
        <div className="app-header__status">
          <span className={`status-dot status-dot--${statusTone}`} />
          {statusText}
        </div>
      </header>

      <aside className="sidebar-left">
        <JobHistory
          jobs={jobs}
          projects={projects}
          activeJobId={activeJobId}
          onSelectJob={setActiveJobId}
          onReusePrompt={handleReusePrompt}
          onNewVideo={handleNewVideo}
        />
      </aside>

      <main className="main-content">
        <VideoPlayer
          job={activeJob}
          timeline={timeline}
          selectedScene={selectedScene}
          onCopyClipboard={handleCopyClipboard}
          onRenderVideo={handleRenderVideo}
          isRendering={isRendering}
        />
        <SceneTimeline
          timeline={timeline}
          selectedScene={selectedScene}
          onSelectScene={setSelectedScene}
        />
        {activeJob && <StatusBar job={activeJob} />}
      </main>

      <aside className="sidebar-right">
        <PromptPanel
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          readiness={readiness}
          selectedScene={selectedScene}
          activeJobId={activeJobId}
          activeJobProjectId={activeJob?.projectId ?? null}
          projects={projects}
          onCreateProject={handleCreateProject}
          onClearScene={() => setSelectedScene(null)}
        />
      </aside>
    </div>
  );
};
