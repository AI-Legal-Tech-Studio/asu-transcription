"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useEffectEvent, useState } from "react";

import { buildAudioUploadPath } from "@/lib/audio-upload";
import { JobHistory } from "@/components/job-history";
import type {
  JobDetail,
  JobListItem,
  ProviderListResponse,
} from "@/lib/jobs";
import type { ProviderOption } from "@/lib/providers/types";
import {
  getUploadSizeLimitMessage,
  isUploadTooLargeSignal,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SIZE_LABEL,
} from "@/lib/upload-limits";

type JobsResponse = {
  jobs: JobListItem[];
};

type JobResponse = {
  job: JobDetail;
};

type ApiErrorPayload = {
  error?: string;
};

type ParsedApiResponse<T> = {
  payload: T | null;
  rawText: string | null;
};

type UploadWorkbenchProps = {
  summaryModel: string;
};

type SubmitStage = "idle" | "uploading" | "processing";
type LoadOptions = {
  silent?: boolean;
};

function isTerminalJobStatus(status: string) {
  return status === "done" || status === "failed";
}

function getDefaultUploadSupport() {
  return {
    mode: "request" as const,
    maxBytes: MAX_AUDIO_BYTES,
    maxSizeLabel: MAX_AUDIO_SIZE_LABEL,
  };
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasProvidersPayload(value: unknown): value is ProviderListResponse {
  return isRecord(value) && Array.isArray(value.providers);
}

function hasJobsPayload(value: unknown): value is JobsResponse {
  return isRecord(value) && Array.isArray(value.jobs);
}

function hasJobPayload(value: unknown): value is JobResponse {
  return isRecord(value) && "job" in value;
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return isRecord(value) && typeof value.error === "string";
}

function normalizeResponseText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

async function parseApiResponse<T>(response: Response): Promise<ParsedApiResponse<T>> {
  const rawText = await response.text();

  if (!rawText) {
    return {
      payload: null,
      rawText: null,
    };
  }

  try {
    return {
      payload: JSON.parse(rawText) as T,
      rawText,
    };
  } catch {
    return {
      payload: null,
      rawText,
    };
  }
}

function getApiErrorMessage(
  payload: unknown,
  rawText: string | null,
  fallback: string,
) {
  if (isErrorPayload(payload)) {
    return payload.error;
  }

  const normalizedText = normalizeResponseText(rawText);

  if (!normalizedText || normalizedText.startsWith("<")) {
    return fallback;
  }

  return normalizedText.length > 180
    ? `${normalizedText.slice(0, 177)}...`
    : normalizedText;
}

function getUploadErrorMessage(payload: unknown, response: Response, rawText: string | null) {
  if (isErrorPayload(payload)) {
    return payload.error;
  }

  if (isUploadTooLargeSignal(response.status, rawText)) {
    return getUploadSizeLimitMessage();
  }

  return getApiErrorMessage(
    payload,
    rawText,
    "The app could not complete the transcript and summary workflow.",
  );
}

export function UploadWorkbench({ summaryModel }: UploadWorkbenchProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [activeJob, setActiveJob] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeJobStatus = activeJob?.status ?? null;

  async function loadProviders() {
    const response = await fetch("/api/providers");
    const { payload, rawText } = await parseApiResponse<
      ProviderListResponse | ApiErrorPayload
    >(response);

    if (!response.ok || !hasProvidersPayload(payload)) {
      throw new Error(
        getApiErrorMessage(
          payload,
          rawText,
          "The app could not load transcription providers.",
        ),
      );
    }

    setProviders(payload.providers);
    setSelectedProviderId(
      payload.defaultProviderId ?? payload.providers[0]?.id ?? "",
    );
  }

  async function loadJobs(selectFirst = false, options?: LoadOptions) {
    if (!options?.silent) {
      setIsLoadingJobs(true);
    }

    try {
      const response = await fetch("/api/jobs");
      const { payload, rawText } = await parseApiResponse<
        JobsResponse | ApiErrorPayload
      >(response);

      if (!response.ok || !hasJobsPayload(payload)) {
        throw new Error(
          getApiErrorMessage(payload, rawText, "The app could not load job history."),
        );
      }

      setJobs(payload.jobs);

      if (selectFirst && payload.jobs[0]) {
        await loadJob(payload.jobs[0].id);
      }
    } finally {
      if (!options?.silent) {
        setIsLoadingJobs(false);
      }
    }
  }

  async function loadJob(jobId: string, options?: LoadOptions) {
    if (!options?.silent) {
      setIsLoadingJob(true);
    }
    setSelectedJobId(jobId);

    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const { payload, rawText } = await parseApiResponse<
        JobResponse | ApiErrorPayload
      >(response);

      if (!response.ok || !hasJobPayload(payload)) {
        throw new Error(
          getApiErrorMessage(payload, rawText, "The app could not load that saved job."),
        );
      }

      setActiveJob(payload.job);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "The app could not load that saved job.";

      setError(message);
    } finally {
      if (!options?.silent) {
        setIsLoadingJob(false);
      }
    }
  }

  async function handleDeleteJob(jobId: string) {
    const confirmed = window.confirm(
      "Delete this transcription from history?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });
      const { payload, rawText } = await parseApiResponse<ApiErrorPayload>(response);

      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(payload, rawText, "The app could not delete that job."),
        );
      }

      const remainingJobs = jobs.filter((job) => job.id !== jobId);
      setJobs(remainingJobs);

      if (selectedJobId === jobId) {
        setSelectedJobId(remainingJobs[0]?.id ?? null);
        setActiveJob(null);

        if (remainingJobs[0]) {
          await loadJob(remainingJobs[0].id);
        }
      }
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "The app could not delete that job.";

      setError(message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const audioFile = formData.get("audio");
    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
    const uploadSupport = selectedProvider?.upload ?? getDefaultUploadSupport();

    if (!(audioFile instanceof File) || audioFile.size === 0) {
      setError("Attach an audio file before you run the workflow.");
      return;
    }

    if (audioFile.size > uploadSupport.maxBytes) {
      setError(getUploadSizeLimitMessage(uploadSupport.maxSizeLabel, uploadSupport.mode));
      return;
    }

    if (!selectedProviderId) {
      setError("Choose a transcription provider before uploading.");
      return;
    }

    formData.set("provider", selectedProviderId);
    setIsSubmitting(true);
    setSubmitStage(uploadSupport.mode === "blob" ? "uploading" : "processing");
    setUploadProgress(uploadSupport.mode === "blob" ? 0 : null);
    setError(null);

    try {
      let requestBody: FormData = formData;

      if (uploadSupport.mode === "blob") {
        const blob = await upload(buildAudioUploadPath(audioFile.name), audioFile, {
          access: "private",
          clientPayload: JSON.stringify({
            providerId: selectedProviderId,
          }),
          contentType: audioFile.type || undefined,
          handleUploadUrl: "/api/uploads",
          multipart: audioFile.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => {
            setUploadProgress(Math.round(percentage));
          },
        });

        requestBody = new FormData();
        requestBody.set("audioBlobUrl", blob.url);
        requestBody.set("audioBlobPathname", blob.pathname);
        requestBody.set("audioFileName", audioFile.name);
        requestBody.set("audioContentType", blob.contentType || audioFile.type || "audio/mpeg");
        requestBody.set("audioSizeBytes", String(audioFile.size));
        requestBody.set("matterType", String(formData.get("matterType") ?? "General intake"));
        requestBody.set("focus", String(formData.get("focus") ?? ""));
        requestBody.set("provider", selectedProviderId);
        setSubmitStage("processing");
      }

      const response = await fetch("/api/summarize", {
        method: "POST",
        body: requestBody,
      });
      const { payload, rawText } = await parseApiResponse<
        JobResponse | ApiErrorPayload
      >(response);

      if (!response.ok || !hasJobPayload(payload)) {
        throw new Error(getUploadErrorMessage(payload, response, rawText));
      }

      setActiveJob(payload.job);
      setSelectedJobId(payload.job.id);
      await loadJobs(false);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "The request did not complete successfully.";

      setError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStage("idle");
      setUploadProgress(null);
    }
  }

  const loadInitialWorkspaceData = useEffectEvent(async () => {
    try {
      await Promise.all([loadProviders(), loadJobs(true)]);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "The app could not load the workspace data.";

      setError(message);
    }
  });

  const pollActiveJob = useEffectEvent(async () => {
    if (!selectedJobId) {
      return;
    }

    await Promise.all([
      loadJob(selectedJobId, { silent: true }),
      loadJobs(false, { silent: true }),
    ]);
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitialWorkspaceData();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    if (!activeJobStatus || isTerminalJobStatus(activeJobStatus)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pollActiveJob();
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeJobStatus, selectedJobId]);

  const providerLabel =
    providers.find((provider) => provider.id === activeJob?.provider)?.name ??
    activeJob?.provider;
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedUploadSupport = selectedProvider?.upload ?? getDefaultUploadSupport();
  const uploadHint =
    selectedUploadSupport.mode === "blob"
      ? selectedProviderId === "gemini"
        ? `Large ${selectedProvider?.name ?? "provider"} uploads go to private Blob storage first. Current limit: ${selectedUploadSupport.maxSizeLabel}. Gemini Blob jobs continue in the background after upload and refresh here automatically.`
        : selectedProviderId === "voxtral-openrouter"
          ? `Large ${selectedProvider?.name ?? "provider"} uploads go to private Blob storage first. Current limit: ${selectedUploadSupport.maxSizeLabel}. Voxtral still runs inside this request after upload and may truncate longer recordings.`
          : `Large ${selectedProvider?.name ?? "provider"} uploads go to private Blob storage first. Current limit: ${selectedUploadSupport.maxSizeLabel}.`
      : `Current limit for ${selectedProvider?.name ?? "this provider"}: ${selectedUploadSupport.maxSizeLabel}.`;
  const submitLabel =
    submitStage === "uploading"
      ? `Uploading audio${
          typeof uploadProgress === "number" ? ` (${uploadProgress}%)` : "..."
        }`
      : submitStage === "processing"
        ? "Processing job..."
        : "Generate clinic brief";

  return (
    <section className="workspace-grid">
      <div className="sidebar-stack">
        <div className="panel workbench-panel">
          <div className="panel-header">
            <p className="eyebrow">Upload + Prompting</p>
            <h2>Start a new transcription</h2>
            <p className="hint">
              Provider selection is required before upload. Gemini can use
              private storage for larger files on Blob-enabled deployments, and
              completed jobs are saved to history.
            </p>
          </div>

          <form className="stack" onSubmit={handleSubmit}>
            <label className="field">
              <span>Transcription provider</span>
              <select
                disabled={providers.length === 0 || isSubmitting}
                name="provider"
                onChange={(event) => setSelectedProviderId(event.target.value)}
                value={selectedProviderId}
              >
                {providers.length === 0 ? (
                  <option value="">No providers configured</option>
                ) : null}

                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.mode})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Audio file</span>
              <input
                accept="audio/*,.mp3,.mp4,.m4a,.mpeg,.mpga,.wav,.webm"
                disabled={providers.length === 0 || isSubmitting}
                name="audio"
                required
                type="file"
              />
              <p className="hint">{uploadHint}</p>
            </label>

            <label className="field">
              <span>Matter type</span>
              <select defaultValue="Client intake" disabled={isSubmitting} name="matterType">
                <option>Client intake</option>
                <option>Witness interview</option>
                <option>Team debrief</option>
                <option>Hearing prep</option>
                <option>General intake</option>
              </select>
            </label>

            <label className="field">
              <span>Clinic focus</span>
              <textarea
                defaultValue="Highlight urgent deadlines, unresolved facts, and follow-up tasks."
                disabled={isSubmitting}
                name="focus"
                rows={4}
              />
            </label>

            <button
              className="primary-button"
              disabled={providers.length === 0 || isSubmitting}
              type="submit"
            >
              {submitLabel}
            </button>
          </form>

          {error ? <p className="notice notice-error">{error}</p> : null}

          <div className="meta-card">
            <p className="eyebrow">Current Summary Model</p>
            <p>
              <strong>Summary drafting:</strong> <code>{summaryModel}</code>
            </p>
          </div>
        </div>

        <JobHistory
          isLoading={isLoadingJobs}
          jobs={jobs}
          onDeleteJob={(jobId) => void handleDeleteJob(jobId)}
          onSelectJob={(jobId) => void loadJob(jobId)}
          selectedJobId={selectedJobId}
        />
      </div>

      <div className="panel results-panel">
        <div className="panel-header">
          <p className="eyebrow">Output</p>
          <h2>Transcript + structured summary</h2>
          <p className="hint">
            Completed jobs persist here and can be re-opened from history.
          </p>
        </div>

        {isLoadingJob ? <p className="hint">Loading saved job…</p> : null}

        {activeJob ? (
          <div className="result-stack">
            <div className="result-header">
              <div>
                <h3>{activeJob.summary?.matterTitle || activeJob.fileName}</h3>
                <p className="hint">
                  {formatDate(activeJob.createdAt)}
                  {" · "}
                  {providerLabel || activeJob.provider}
                </p>
              </div>
              <span
                className={`status-pill ${
                  activeJob.status === "done"
                    ? "status-good"
                    : activeJob.status === "failed"
                      ? "status-bad"
                      : ""
                }`}
              >
                {activeJob.status}
              </span>
            </div>

            {activeJob.errorMessage ? (
              <p className="notice notice-error">{activeJob.errorMessage}</p>
            ) : null}

            {activeJobStatus && !isTerminalJobStatus(activeJobStatus) ? (
              <p className="notice">
                This job is still processing in the background. The transcript
                and summary refresh automatically while it runs.
              </p>
            ) : null}

            {activeJob.summary ? (
              <>
                {activeJob.summary.speakers.length > 0 ? (
                  <article className="result-section">
                    <h4>Speakers</h4>
                    <ul className="plain-list">
                      {activeJob.summary.speakers.map((speaker) => (
                        <li key={`${speaker.label}-${speaker.inferredRole ?? ""}`}>
                          <strong>{speaker.label}</strong>
                          {speaker.inferredRole ? `: ${speaker.inferredRole}` : ""}
                        </li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                <article className="result-section">
                  <h4>Executive summary</h4>
                  <p>{activeJob.summary.executiveSummary}</p>
                </article>

                <article className="result-section">
                  <h4>Client objectives</h4>
                  <ul className="plain-list">
                    {activeJob.summary.clientObjectives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Material facts</h4>
                  <ul className="plain-list">
                    {activeJob.summary.materialFacts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Legal issues</h4>
                  <ul className="plain-list">
                    {activeJob.summary.legalIssues.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Timeline</h4>
                  <ul className="plain-list">
                    {activeJob.summary.timeline.map((item) => (
                      <li key={`${item.moment}-${item.significance}`}>
                        <strong>{item.moment}</strong>: {item.significance}
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Risks and cautions</h4>
                  <ul className="plain-list">
                    {activeJob.summary.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Action items</h4>
                  <ul className="plain-list">
                    {activeJob.summary.actionItems.map((item) => (
                      <li key={`${item.owner}-${item.task}`}>
                        <strong>{item.owner}</strong> ({item.urgency}): {item.task}
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Follow-up questions</h4>
                  <ul className="plain-list">
                    {activeJob.summary.followUpQuestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Recommended artifacts</h4>
                  <ul className="plain-list">
                    {activeJob.summary.recommendedArtifacts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="result-section">
                  <h4>Confidentiality note</h4>
                  <p>{activeJob.summary.confidentialityNotes}</p>
                </article>
              </>
            ) : (
              <div className="empty-state compact-empty">
                <p className="eyebrow">Summary pending</p>
                <p>This job does not have a completed summary yet.</p>
              </div>
            )}

            {activeJob.transcript ? (
              <details className="transcript-card" open>
                <summary>View transcript</summary>
                <div className="transcript-actions">
                  <a
                    href={`/api/jobs/${activeJob.id}/download?format=txt`}
                    className="download-btn"
                    download
                  >
                    Download .TXT
                  </a>
                  <a
                    href={`/api/jobs/${activeJob.id}/download?format=docx`}
                    className="download-btn"
                    download
                  >
                    Download .DOCX
                  </a>
                </div>
                <pre>{renderTranscript(activeJob)}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">Waiting for a recording</p>
            <h3>No job selected</h3>
            <p>
              Upload a new recording or pick a saved transcription from the
              history list to view its transcript and structured summary.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
