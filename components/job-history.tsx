"use client";

import type { JobListItem } from "@/lib/jobs";

type JobHistoryProps = {
  isLoading: boolean;
  jobs: JobListItem[];
  onDeleteJob: (id: string) => void;
  onSelectJob: (id: string) => void;
  selectedJobId: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function JobHistory({
  isLoading,
  jobs,
  onDeleteJob,
  onSelectJob,
  selectedJobId,
}: JobHistoryProps) {
  return (
    <section className="job-history panel">
      <div className="panel-header">
        <p className="eyebrow">History</p>
        <h2>Saved transcriptions</h2>
        <p className="hint">Each signed-in user only sees their own jobs.</p>
      </div>

      {isLoading ? <p className="hint">Loading saved jobs…</p> : null}

      {!isLoading && jobs.length === 0 ? (
        <div className="empty-state compact-empty">
          <p className="eyebrow">No history yet</p>
          <p>Your completed jobs will appear here after the first upload.</p>
        </div>
      ) : null}

      <div className="job-list">
        {jobs.map((job) => (
          <article
            key={job.id}
            className={`job-card ${selectedJobId === job.id ? "job-card-active" : ""}`}
          >
            <button
              className="job-select"
              onClick={() => onSelectJob(job.id)}
              type="button"
            >
              <strong>{job.fileName}</strong>
              <span>{formatDate(job.createdAt)}</span>
              <span>{job.matterType}</span>
              <span>{job.provider}</span>
              <span>{job.status}</span>
            </button>

            <button
              className="danger-button"
              onClick={() => onDeleteJob(job.id)}
              type="button"
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
