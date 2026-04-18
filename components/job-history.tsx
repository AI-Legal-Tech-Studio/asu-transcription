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

function getStatusTone(status: string) {
  if (status === "done") {
    return "status-chip-good";
  }

  if (status === "failed") {
    return "status-chip-bad";
  }

  return "status-chip-live";
}

export function JobHistory({
  isLoading,
  jobs,
  onDeleteJob,
  onSelectJob,
  selectedJobId,
}: JobHistoryProps) {
  return (
    <section className="history-panel">
      <header className="panel-heading">
        <div>
          <p className="section-kicker">Matter history</p>
          <h2>Saved recordings</h2>
        </div>
        <p className="muted-copy">Only your own saved jobs appear here.</p>
      </header>

      {isLoading ? (
        <p className="muted-copy">
          Connecting to matter history. If the database is waking up, this can
          take a moment.
        </p>
      ) : null}

      {!isLoading && jobs.length === 0 ? (
        <div className="history-empty">
          <p className="section-kicker">No saved matters yet</p>
          <p className="muted-copy">
            The first completed upload will show up here with its transcript and
            review artifacts.
          </p>
        </div>
      ) : null}

      <div className="history-list">
        {jobs.map((job) => (
          <article
            key={job.id}
            className={`history-item ${selectedJobId === job.id ? "history-item-active" : ""}`}
          >
            <button
              className="history-select"
              onClick={() => onSelectJob(job.id)}
              type="button"
            >
              <div className="history-item-top">
                <strong>{job.fileName}</strong>
                <span className={`status-chip ${getStatusTone(job.status)}`}>{job.status}</span>
              </div>
              <p className="muted-copy">{job.matterType}</p>
              <p className="history-meta">{formatDate(job.createdAt)}</p>
              <p className="history-meta">{job.provider}</p>
            </button>

            <button
              className="tertiary-button danger-button"
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
