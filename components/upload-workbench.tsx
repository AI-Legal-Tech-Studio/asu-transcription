"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobHistory } from "@/components/job-history";
import { PipelineStatus, buildPipelineStages } from "@/components/pipeline-status";
import {
  WorkbenchDocument,
  type WorkbenchTab,
} from "@/components/workbench-document";
import { buildAudioUploadPath } from "@/lib/audio-upload";
import type {
  JobDetail,
  JobListItem,
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
  currentUserEmail: string | null;
  defaultProviderId: string | null;
  hasBlobStore: boolean;
  hasDatabase: boolean;
  hasSummary: boolean;
  initialProviders: ProviderOption[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
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

function getUploadErrorMessage(
  payload: unknown,
  response: Response,
  rawText: string | null,
) {
  if (isErrorPayload(payload)) {
    return payload.error;
  }

  if (isUploadTooLargeSignal(response.status, rawText)) {
    return getUploadSizeLimitMessage();
  }

  return getApiErrorMessage(
    payload,
    rawText,
    "The workbench could not complete the transcript and review workflow.",
  );
}

function getProviderUploadHint(provider?: ProviderOption) {
  const uploadSupport = provider?.upload ?? getDefaultUploadSupport();

  if (!provider) {
    return `Current limit for this provider: ${uploadSupport.maxSizeLabel}.`;
  }

  if (uploadSupport.mode === "blob") {
    return `${provider.name} uses private blob upload for larger recordings. Current limit: ${uploadSupport.maxSizeLabel}.`;
  }

  return `${provider.name} currently accepts up to ${uploadSupport.maxSizeLabel} per request on this deployment.`;
}

export function UploadWorkbench({
  currentUserEmail,
  defaultProviderId,
  hasBlobStore,
  hasDatabase,
  hasSummary,
  initialProviders,
  summaryModel,
}: UploadWorkbenchProps) {
  const [selectedProviderId, setSelectedProviderId] = useState(
    defaultProviderId ?? initialProviders[0]?.id ?? "",
  );
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [activeJob, setActiveJob] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("brief");
  const [isLoadingJobs, setIsLoadingJobs] = useState(hasDatabase);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const providers = initialProviders;
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedUploadSupport = selectedProvider?.upload ?? getDefaultUploadSupport();
  const activeJobStatus = activeJob?.status ?? null;

  const loadJob = useCallback(
    async (jobId: string, options?: LoadOptions) => {
      if (!hasDatabase) {
        return;
      }

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
            getApiErrorMessage(payload, rawText, "The workbench could not open that matter."),
          );
        }

        setActiveJob(payload.job);
        setWorkspaceError(null);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "The workbench could not open that matter.";

        setWorkspaceError(message);
      } finally {
        if (!options?.silent) {
          setIsLoadingJob(false);
        }
      }
    },
    [hasDatabase],
  );

  const loadJobs = useCallback(
    async (options?: LoadOptions) => {
      if (!hasDatabase) {
        setIsLoadingJobs(false);
        return;
      }

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
            getApiErrorMessage(
              payload,
              rawText,
              "The workbench could not load matter history.",
            ),
          );
        }

        setJobs(payload.jobs);
        setWorkspaceError(null);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "The workbench could not load matter history.";

        setWorkspaceError(message);
      } finally {
        if (!options?.silent) {
          setIsLoadingJobs(false);
        }
      }
    },
    [hasDatabase],
  );

  useEffect(() => {
    const initializeJobs = async () => {
      await loadJobs();
    };

    void initializeJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (selectedJobId || jobs.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadJob(jobs[0].id, { silent: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [jobs, loadJob, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId || !activeJobStatus || isTerminalJobStatus(activeJobStatus)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([
        loadJob(selectedJobId, { silent: true }),
        loadJobs({ silent: true }),
      ]);
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeJobStatus, loadJob, loadJobs, selectedJobId]);

  async function handleDeleteJob(jobId: string) {
    const confirmed = window.confirm("Delete this saved matter from history?");

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
          getApiErrorMessage(payload, rawText, "The workbench could not delete that matter."),
        );
      }

      const remainingJobs = jobs.filter((job) => job.id !== jobId);
      setJobs(remainingJobs);

      if (selectedJobId === jobId) {
        setSelectedJobId(remainingJobs[0]?.id ?? null);
        setActiveJob(null);
        setActiveTab("brief");

        if (remainingJobs[0]) {
          await loadJob(remainingJobs[0].id);
        }
      }
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "The workbench could not delete that matter.";

      setWorkspaceError(message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasDatabase) {
      setWorkspaceError("Database persistence is not configured on this deployment.");
      return;
    }

    if (!hasSummary) {
      setWorkspaceError("Summary generation is not configured on this deployment.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const audioFile = formData.get("audio");
    const uploadSupport = selectedProvider?.upload ?? getDefaultUploadSupport();

    if (!(audioFile instanceof File) || audioFile.size === 0) {
      setWorkspaceError("Attach an audio file before you run the workflow.");
      return;
    }

    if (audioFile.size > uploadSupport.maxBytes) {
      setWorkspaceError(
        getUploadSizeLimitMessage(uploadSupport.maxSizeLabel, uploadSupport.mode),
      );
      return;
    }

    if (!selectedProviderId) {
      setWorkspaceError("Choose a transcription provider before uploading.");
      return;
    }

    formData.set("provider", selectedProviderId);
    setIsSubmitting(true);
    setSubmitStage(uploadSupport.mode === "blob" ? "uploading" : "processing");
    setUploadProgress(uploadSupport.mode === "blob" ? 0 : null);
    setWorkspaceError(null);

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
      setActiveTab("brief");
      await loadJobs({ silent: true });
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "The workbench could not finish the request.";

      setWorkspaceError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStage("idle");
      setUploadProgress(null);
    }
  }

  const providerLabel =
    providers.find((provider) => provider.id === activeJob?.provider)?.name ??
    activeJob?.provider ??
    null;

  const submitLabel =
    submitStage === "uploading"
      ? `Uploading${typeof uploadProgress === "number" ? ` (${uploadProgress}%)` : ""}`
      : submitStage === "processing"
        ? "Processing matter"
        : "Generate work product";

  const systemNotes = useMemo(() => {
    const notes: string[] = [];

    if (!hasDatabase) {
      notes.push("Database persistence is missing, so uploads and history are disabled.");
    }

    if (!hasSummary) {
      notes.push("Structured summary generation is not configured on this deployment.");
    }

    if (providers.length === 0) {
      notes.push(
        "No transcription provider is configured. Add Google, OpenAI, OpenRouter, or whisper-local credentials.",
      );
    }

    if (!hasBlobStore) {
      notes.push("Large direct-to-blob uploads are unavailable without Blob configuration.");
    }

    return notes;
  }, [hasBlobStore, hasDatabase, hasSummary, providers.length]);

  const outputSnapshot = useMemo(() => {
    if (!activeJob?.summary) {
      return [
        { label: "Speakers", value: "0" },
        { label: "Issues", value: "0" },
        { label: "Actions", value: "0" },
        { label: "Follow-up", value: "0" },
      ];
    }

    return [
      { label: "Speakers", value: String(activeJob.summary.speakers.length) },
      { label: "Issues", value: String(activeJob.summary.legalIssues.length) },
      { label: "Actions", value: String(activeJob.summary.actionItems.length) },
      {
        label: "Follow-up",
        value: String(activeJob.summary.followUpQuestions.length),
      },
    ];
  }, [activeJob]);

  const stages = buildPipelineStages(activeJob);
  const canSubmit =
    Boolean(selectedProviderId) && providers.length > 0 && hasDatabase && hasSummary;

  return (
    <section className="workbench-layout">
      <aside className="workbench-rail">
        <section className="composer-panel">
          <header className="panel-heading">
            <div>
              <p className="section-kicker">New recording</p>
              <h2>Start intake review</h2>
            </div>
            <p className="muted-copy">
              Pick the provider, give the model matter context, and keep moving.
            </p>
          </header>

          {workspaceError ? <p className="inline-alert">{workspaceError}</p> : null}

          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Transcription provider</span>
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
              <span className="field-label">Audio file</span>
              <input
                accept="audio/*,.mp3,.mp4,.m4a,.mpeg,.mpga,.wav,.webm"
                disabled={providers.length === 0 || isSubmitting}
                name="audio"
                required
                type="file"
              />
              <p className="field-hint">{getProviderUploadHint(selectedProvider)}</p>
            </label>

            <label className="field">
              <span className="field-label">Matter type</span>
              <select defaultValue="Client intake" disabled={isSubmitting} name="matterType">
                <option>Client intake</option>
                <option>Witness interview</option>
                <option>Team debrief</option>
                <option>Hearing prep</option>
                <option>General intake</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">Clinic focus</span>
              <textarea
                defaultValue="Highlight urgent deadlines, unresolved facts, and follow-up tasks."
                disabled={isSubmitting}
                name="focus"
                rows={5}
              />
            </label>

            <button className="primary-button" disabled={!canSubmit || isSubmitting} type="submit">
              {submitLabel}
            </button>
          </form>

          <div className="provider-summary">
            <p className="section-kicker">Selected route</p>
            <h3>{selectedProvider?.name ?? "Configuration needed"}</h3>
            <p className="muted-copy">
              {selectedProvider?.description ??
                "Once a provider is configured, this panel will describe how the audio will be processed."}
            </p>
            <ul className="inline-stat-list">
              <li>{selectedProvider?.mode ?? "unavailable"}</li>
              <li>{selectedUploadSupport.mode === "blob" ? "blob upload" : "direct request"}</li>
              <li>{selectedUploadSupport.maxSizeLabel}</li>
            </ul>
          </div>
        </section>

        <JobHistory
          isLoading={isLoadingJobs}
          jobs={jobs}
          onDeleteJob={(jobId) => void handleDeleteJob(jobId)}
          onSelectJob={(jobId) => void loadJob(jobId)}
          selectedJobId={selectedJobId}
        />
      </aside>

      <div className="workbench-center-column">
        <section className="pipeline-panel">
          <header className="panel-heading">
            <div>
              <p className="section-kicker">Matter flow</p>
              <h2>From recording to reviewed work product</h2>
            </div>
            <p className="muted-copy">
              Each saved matter moves through upload, transcription, extraction,
              review, and export.
            </p>
          </header>

          <PipelineStatus stages={stages} />
        </section>

        <WorkbenchDocument
          activeJob={activeJob}
          activeTab={activeTab}
          isLoadingJob={isLoadingJob}
          onTabChange={setActiveTab}
          providerLabel={providerLabel}
        />
      </div>

      <aside className="workbench-inspector">
        <header className="panel-heading">
          <div>
            <p className="section-kicker">System state</p>
            <h2>Operational notes</h2>
          </div>
          <p className="muted-copy">
            The point is steady legal workflow, not mystery behavior.
          </p>
        </header>

        <section className="inspector-section">
          <p className="section-kicker">Deployment</p>
          <dl className="inspector-stats">
            <div>
              <dt>User</dt>
              <dd>{currentUserEmail ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Summary model</dt>
              <dd>{summaryModel}</dd>
            </div>
            <div>
              <dt>Blob upload</dt>
              <dd>{hasBlobStore ? "Available" : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Providers</dt>
              <dd>{providers.length}</dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section">
          <p className="section-kicker">Output snapshot</p>
          <div className="snapshot-grid">
            {outputSnapshot.map((item) => (
              <div key={item.label} className="snapshot-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <p className="section-kicker">Review reminders</p>
          <ul className="detail-list">
            <li>verify names, dates, and deadlines before filing or advising</li>
            <li>treat ambiguity and missing facts as work to do, not resolved truth</li>
            <li>export only after checking confidentiality and consent constraints</li>
          </ul>
        </section>

        {systemNotes.length > 0 ? (
          <section className="inspector-section">
            <p className="section-kicker">Configuration notes</p>
            <ul className="detail-list">
              {systemNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </section>
  );
}
