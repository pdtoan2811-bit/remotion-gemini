import type { PromptJob, VideoProject } from "../../lib/types";

interface JobHistoryProps {
  jobs: PromptJob[];
  projects: VideoProject[];
  activeJobId: string | null;
  onSelectJob: (id: string) => void;
  onReusePrompt: (prompt: string) => void;
  onNewVideo: () => void;
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

function buildJobChains(
  jobs: PromptJob[]
): Array<{ root: PromptJob; children: PromptJob[] }> {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const roots: PromptJob[] = [];
  const childMap = new Map<string, PromptJob[]>();

  for (const job of jobs) {
    if (job.parentJobId && jobsById.has(job.parentJobId)) {
      const children = childMap.get(job.parentJobId) ?? [];
      children.push(job);
      childMap.set(job.parentJobId, children);
      continue;
    }
    roots.push(job);
  }

  return roots
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((root) => ({
      root,
      children: (childMap.get(root.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }));
}

const JobCard: React.FC<{
  job: PromptJob;
  isActive: boolean;
  version?: number;
  isChild?: boolean;
  onSelect: () => void;
  onReuse: () => void;
}> = ({ job, isActive, version, isChild = false, onSelect, onReuse }) => (
  <div
    className={`job-card ${isActive ? "job-card--active" : ""} ${
      isChild ? "job-card--child" : ""
    }`}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onSelect();
    }}
  >
    <div className="job-card__header">
      <div className={`job-card__status job-card__status--${job.status}`} />
      <span className="job-card__id">#{job.id}</span>
      {version !== undefined && <span className="job-card__version">v{version}</span>}
      {job.refinedSceneId && (
        <span className="job-card__scene-badge">Scene: {job.refinedSceneId}</span>
      )}
    </div>
    <div className="job-card__prompt">{job.prompt}</div>
    <div className="job-card__footer">
      <span className="job-card__time">{timeAgo(job.createdAt)}</span>
      <button
        className="job-card__reuse"
        onClick={(event) => {
          event.stopPropagation();
          onReuse();
        }}
        type="button"
        title="Re-use this prompt"
      >
        Reuse
      </button>
    </div>
  </div>
);

export const JobHistory: React.FC<JobHistoryProps> = ({
  jobs,
  projects,
  activeJobId,
  onSelectJob,
  onReusePrompt,
  onNewVideo,
}) => {
  const jobsByProject = new Map<string, PromptJob[]>();
  for (const job of jobs) {
    const list = jobsByProject.get(job.projectId) ?? [];
    list.push(job);
    jobsByProject.set(job.projectId, list);
  }

  const sortedProjectSections = projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      jobs: jobsByProject.get(project.id) ?? [],
    }))
    .filter((section) => section.jobs.length > 0)
    .sort(
      (a, b) =>
        new Date(b.jobs[0].createdAt).getTime() -
        new Date(a.jobs[0].createdAt).getTime()
    );

  const unknownProjectSections = Array.from(jobsByProject.entries())
    .filter(([projectId]) => projects.every((project) => project.id !== projectId))
    .map(([projectId, projectJobs]) => ({
      id: projectId,
      name: projectId,
      jobs: projectJobs,
    }));

  const sections = [...sortedProjectSections, ...unknownProjectSections];

  return (
    <>
      <div className="sidebar-left__header">
        <div className="sidebar-left__title">Project History ({jobs.length})</div>
        <button
          className="new-video-btn"
          onClick={onNewVideo}
          type="button"
          id="new-video-btn"
        >
          + New
        </button>
      </div>

      <div className="job-list">
        {jobs.length === 0 ? (
          <div className="job-list__empty">
            <div className="job-list__empty-icon">🎞</div>
            <div className="job-list__empty-text">
              No videos generated yet.
              <br />
              Submit a prompt to get started.
            </div>
          </div>
        ) : (
          sections.map((section) => {
            const chains = buildJobChains(section.jobs);
            return (
              <div key={section.id} className="project-section">
                <div className="project-section__header">
                  <span className="project-section__name">{section.name}</span>
                  <span className="project-section__meta">{section.jobs.length}</span>
                </div>

                {chains.map(({ root, children }) => (
                  <div key={root.id} className="job-chain">
                    <JobCard
                      job={root}
                      isActive={root.id === activeJobId}
                      version={children.length > 0 ? 1 : undefined}
                      onSelect={() => onSelectJob(root.id)}
                      onReuse={() => onReusePrompt(root.prompt)}
                    />
                    {children.length > 0 && (
                      <div className="job-chain__children">
                        {children.map((child, index) => (
                          <JobCard
                            key={child.id}
                            job={child}
                            isActive={child.id === activeJobId}
                            version={index + 2}
                            isChild
                            onSelect={() => onSelectJob(child.id)}
                            onReuse={() => onReusePrompt(child.prompt)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </>
  );
};
