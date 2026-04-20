import { useRef, useState, useCallback } from "react";
import type { PromptJob } from "../../lib/types";

interface VideoPlayerProps {
  job: PromptJob | null;
  onCopyClipboard: (jobId: string) => Promise<boolean>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  job,
  onCopyClipboard,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!job) return;
    const success = await onCopyClipboard(job.id);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [job, onCopyClipboard]);

  const handleDownload = useCallback(() => {
    if (!job?.videoUrl) return;
    const a = document.createElement("a");
    a.href = job.videoUrl;
    a.download = `${job.id}.mp4`;
    a.click();
  }, [job]);

  return (
    <div className="video-container">
      <div className="video-wrapper">
        {job?.videoUrl ? (
          <video
            ref={videoRef}
            src={job.videoUrl}
            controls
            autoPlay
            loop
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : job ? (
          <div className="video-placeholder">
            <div className="video-placeholder__icon">
              {job.status === "queued" && "⏳"}
              {job.status === "processing" && "🧠"}
              {job.status === "rendering" && "🎬"}
              {job.status === "done" && "✅"}
              {job.status === "error" && "❌"}
            </div>
            <div className="video-placeholder__text">
              {job.status === "queued" &&
                "Waiting for Antigravity agent to pick up this prompt..."}
              {job.status === "processing" &&
                "Agent is generating your video assets..."}
              {job.status === "rendering" &&
                "Rendering your video — this may take a minute..."}
              {job.status === "done" &&
                "Assets are ready! Run remotion render to produce the video."}
              {job.status === "error" && (
                <>
                  Something went wrong.
                  <br />
                  <span style={{ fontSize: 12, color: "var(--error)" }}>
                    {job.error}
                  </span>
                </>
              )}
            </div>

            {/* ── Animated processing indicator ──────────────────────── */}
            {(job.status === "processing" || job.status === "rendering") && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="video-placeholder">
            <div className="video-placeholder__icon">🎬</div>
            <div className="video-placeholder__text">
              Submit a prompt to generate your first video
            </div>
          </div>
        )}
      </div>

      {/* ── Controls below video ──────────────────────────────────────── */}
      {job && (
        <div className="video-controls">
          <button
            className={`clipboard-btn ${copied ? "clipboard-btn--copied" : ""}`}
            onClick={handleCopy}
            type="button"
            id="copy-prompt-btn"
            style={{ width: "auto", padding: "6px 16px" }}
          >
            {copied ? "✅ Copied!" : "📋 Copy Prompt"}
          </button>

          {job.videoUrl && (
            <button
              className="video-controls__btn"
              onClick={handleDownload}
              type="button"
              id="download-btn"
            >
              ⬇ Download
            </button>
          )}

          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
            }}
          >
            {job.id}
          </span>
        </div>
      )}
    </div>
  );
};
