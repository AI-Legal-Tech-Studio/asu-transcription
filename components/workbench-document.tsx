import type { JobDetail } from "@/lib/jobs";

export type WorkbenchTab = "brief" | "chronology" | "review" | "transcript";

type WorkbenchDocumentProps = {
  activeJob: JobDetail | null;
  activeTab: WorkbenchTab;
  isLoadingJob: boolean;
  onTabChange: (tab: WorkbenchTab) => void;
  providerLabel: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderTranscript(job: JobDetail) {
  if (job.speakerSegments.length > 0) {
    return job.speakerSegments
      .map((segment) => {
        const speaker = segment.speaker?.trim() || "Speaker";
        return `${speaker}: ${segment.text}`;
      })
      .join("\n\n");
  }

  return job.transcript ?? "";
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return <p className="muted-copy">Nothing was extracted for this section yet.</p>;
  }

  return (
    <ul className="detail-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function renderBrief(activeJob: JobDetail) {
  const summary = activeJob.summary;

  if (!summary) {
    return (
      <div className="document-empty">
        <p className="section-kicker">Brief pending</p>
        <h3>The case brief will land here after review artifacts are ready.</h3>
        <p className="muted-copy">
          Once transcription and extraction finish, this view will surface the
          executive summary, material facts, legal issues, and the rest of the
          clinic-ready work product.
        </p>
      </div>
    );
  }

  return (
    <div className="document-grid">
      <section className="document-section document-section-wide">
        <p className="section-kicker">Executive summary</p>
        <h3>{summary.matterTitle || activeJob.fileName}</h3>
        <p>{summary.executiveSummary}</p>
      </section>

      <section className="document-section">
        <p className="section-kicker">Speakers</p>
        {summary.speakers.length > 0 ? (
          <ul className="detail-list">
            {summary.speakers.map((speaker) => (
              <li key={`${speaker.label}-${speaker.inferredRole ?? ""}`}>
                <strong>{speaker.label}</strong>
                {speaker.inferredRole ? `: ${speaker.inferredRole}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">Speaker identities were not confidently inferred.</p>
        )}
      </section>

      <section className="document-section">
        <p className="section-kicker">Client objectives</p>
        {renderList(summary.clientObjectives)}
      </section>

      <section className="document-section">
        <p className="section-kicker">Material facts</p>
        {renderList(summary.materialFacts)}
      </section>

      <section className="document-section">
        <p className="section-kicker">Legal issues</p>
        {renderList(summary.legalIssues)}
      </section>

      <section className="document-section">
        <p className="section-kicker">Recommended artifacts</p>
        {renderList(summary.recommendedArtifacts)}
      </section>
    </div>
  );
}

function renderChronology(activeJob: JobDetail) {
  const timeline = activeJob.summary?.timeline ?? [];

  if (timeline.length === 0) {
    return (
      <div className="document-empty">
        <p className="section-kicker">Chronology pending</p>
        <h3>No chronology has been extracted yet.</h3>
        <p className="muted-copy">
          Longer recordings and richer summaries produce the strongest timeline
          views, especially once dates and turning points are clearly stated in
          the recording.
        </p>
      </div>
    );
  }

  return (
    <ol className="timeline-list">
      {timeline.map((item) => (
        <li key={`${item.moment}-${item.significance}`} className="timeline-item">
          <p className="timeline-moment">{item.moment}</p>
          <p className="timeline-significance">{item.significance}</p>
        </li>
      ))}
    </ol>
  );
}

function renderReview(activeJob: JobDetail) {
  const summary = activeJob.summary;

  if (!summary) {
    return (
      <div className="document-empty">
        <p className="section-kicker">Review queue</p>
        <h3>Nothing to review yet.</h3>
        <p className="muted-copy">
          This view is where unresolved issues, risks, and follow-up work will
          surface once extraction completes.
        </p>
      </div>
    );
  }

  return (
    <div className="document-grid">
      <section className="document-section">
        <p className="section-kicker">Action items</p>
        {summary.actionItems.length > 0 ? (
          <ul className="detail-list">
            {summary.actionItems.map((item) => (
              <li key={`${item.owner}-${item.task}`}>
                <strong>{item.owner}</strong> ({item.urgency}): {item.task}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No action items were extracted.</p>
        )}
      </section>

      <section className="document-section">
        <p className="section-kicker">Follow-up questions</p>
        {renderList(summary.followUpQuestions)}
      </section>

      <section className="document-section">
        <p className="section-kicker">Risks and cautions</p>
        {renderList(summary.risks)}
      </section>

      <section className="document-section">
        <p className="section-kicker">Confidentiality note</p>
        <p>{summary.confidentialityNotes}</p>
      </section>
    </div>
  );
}

function renderTranscriptTab(activeJob: JobDetail) {
  if (!activeJob.transcript) {
    return (
      <div className="document-empty">
        <p className="section-kicker">Transcript pending</p>
        <h3>The transcript is not ready yet.</h3>
        <p className="muted-copy">
          As soon as transcription finishes, the full text will appear here with
          download links for `.txt` and `.docx`.
        </p>
      </div>
    );
  }

  return (
    <div className="transcript-surface">
      <div className="document-toolbar">
        <a
          href={`/api/jobs/${activeJob.id}/download?format=txt`}
          className="secondary-button"
          download
        >
          Download .TXT
        </a>
        <a
          href={`/api/jobs/${activeJob.id}/download?format=docx`}
          className="secondary-button"
          download
        >
          Download .DOCX
        </a>
      </div>
      <pre>{renderTranscript(activeJob)}</pre>
    </div>
  );
}

function renderEmptyTemplate() {
  return (
    <div className="document-template">
      <section className="document-section document-section-wide">
        <p className="section-kicker">Matter brief</p>
        <h3>Select a saved recording or start a new one.</h3>
        <p className="muted-copy">
          This surface is designed for the work that comes after intake: the
          brief, chronology, review notes, and transcript all live in one place
          so the clinic team does not need to reconstruct the matter by hand.
        </p>
      </section>

      <section className="document-section">
        <p className="section-kicker">What lands here</p>
        <ul className="detail-list">
          <li>client objectives and material facts</li>
          <li>issues, cautions, and missing follow-up</li>
          <li>chronology extracted from the recording</li>
          <li>exportable transcript and briefing artifacts</li>
        </ul>
      </section>

      <section className="document-section">
        <p className="section-kicker">Review stance</p>
        <ul className="detail-list">
          <li>confirm names, dates, and deadlines</li>
          <li>check anything that sounds like legal advice</li>
          <li>treat the transcript as a draft record, not final truth</li>
        </ul>
      </section>
    </div>
  );
}

export function WorkbenchDocument({
  activeJob,
  activeTab,
  isLoadingJob,
  onTabChange,
  providerLabel,
}: WorkbenchDocumentProps) {
  const tabs: Array<{ id: WorkbenchTab; label: string }> = [
    { id: "brief", label: "Brief" },
    { id: "chronology", label: "Chronology" },
    { id: "review", label: "Review" },
    { id: "transcript", label: "Transcript" },
  ];

  let body = renderEmptyTemplate();

  if (activeJob) {
    if (activeTab === "brief") {
      body = renderBrief(activeJob);
    } else if (activeTab === "chronology") {
      body = renderChronology(activeJob);
    } else if (activeTab === "review") {
      body = renderReview(activeJob);
    } else {
      body = renderTranscriptTab(activeJob);
    }
  }

  return (
    <section className="document-panel">
      <header className="document-header">
        <div>
          <p className="section-kicker">Active matter</p>
          <h2>
            {activeJob?.summary?.matterTitle || activeJob?.fileName || "No matter selected"}
          </h2>
          <p className="muted-copy">
            {activeJob
              ? `${formatDate(activeJob.createdAt)} · ${providerLabel || activeJob.provider}`
              : "The current panel is empty until you pick a saved matter or submit a new recording."}
          </p>
        </div>
        {activeJob ? (
          <span
            className={`status-chip ${
              activeJob.status === "done"
                ? "status-chip-good"
                : activeJob.status === "failed"
                  ? "status-chip-bad"
                  : "status-chip-live"
            }`}
          >
            {activeJob.status}
          </span>
        ) : null}
      </header>

      <nav className="document-tabs" aria-label="Matter views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isLoadingJob ? (
        <div className="document-loading">
          <p className="section-kicker">Opening matter</p>
          <p className="muted-copy">Loading the saved transcript and review artifacts.</p>
        </div>
      ) : (
        <div className="document-body">{body}</div>
      )}
    </section>
  );
}
