import type { PromptJob } from "../../lib/types";

interface JobHistoryProps {
  jobs: PromptJob[];
  activeJobId: string | null;
  onSelectJob: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const JobHistory: React.FC<JobHistoryProps> = ({
  jobs,
  activeJobId,
  onSelectJob,
}) => {
  return (
    <>
      <div className="sidebar-left__header">
        <div className="sidebar-left__title">
          Generation History ({jobs.length})
        </div>
      </div>

      <div className="job-list">
        {jobs.length === 0 ? (
          <div className="job-list__empty">
            <div className="job-list__empty-icon">📹</div>
            <div className="job-list__empty-text">
              No videos generated yet.
              <br />
              Submit a prompt to get started!
            </div>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={`job-card ${job.id === activeJobId ? "job-card--active" : ""}`}
              onClick={() => onSelectJob(job.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectJob(job.id);
              }}
            >
              <div className="job-card__header">
                <div
                  className={`job-card__status job-card__status--${job.status}`}
                />
                <span className="job-card__id">#{job.id}</span>
              </div>
              <div className="job-card__prompt">{job.prompt}</div>
              <div className="job-card__time">{timeAgo(job.createdAt)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
};
