import type { JobDetail } from "@/lib/jobs";

type StageState = "active" | "complete" | "error" | "idle";

export type PipelineStage = {
  description: string;
  id: string;
  label: string;
  state: StageState;
};

function inferFailureStage(job: JobDetail) {
  if (job.summary) {
    return "review";
  }

  if (job.transcript) {
    return "extract";
  }

  return "transcribe";
}

export function buildPipelineStages(job: JobDetail | null): PipelineStage[] {
  const stageLabels: Array<Pick<PipelineStage, "description" | "id" | "label">> = [
    {
      id: "upload",
      label: "Upload",
      description: "Recordings arrive with matter context.",
    },
    {
      id: "transcribe",
      label: "Transcribe",
      description: "Audio becomes a speaker-aware record.",
    },
    {
      id: "extract",
      label: "Extract",
      description: "Chronology, issues, and follow-up are extracted.",
    },
    {
      id: "review",
      label: "Review",
      description: "The clinic team verifies what matters.",
    },
    {
      id: "export",
      label: "Export",
      description: "The work product is ready to leave the workbench.",
    },
  ];

  if (!job) {
    return stageLabels.map((stage, index) => ({
      ...stage,
      state: index === 0 ? "active" : "idle",
    }));
  }

  const failureStage = job.status === "failed" ? inferFailureStage(job) : null;

  return stageLabels.map((stage) => {
    if (job.status === "done") {
      return {
        ...stage,
        state: "complete",
      };
    }

    if (failureStage === stage.id) {
      return {
        ...stage,
        state: "error",
      };
    }

    switch (stage.id) {
      case "upload":
        return {
          ...stage,
          state: "complete",
        };
      case "transcribe":
        return {
          ...stage,
          state:
            job.status === "pending" || job.status === "transcribing"
              ? "active"
              : job.transcript
                ? "complete"
                : "idle",
        };
      case "extract":
        return {
          ...stage,
          state:
            job.status === "summarizing"
              ? "active"
              : job.summary
                ? "complete"
                : "idle",
        };
      case "review":
        return {
          ...stage,
          state: job.summary ? "active" : "idle",
        };
      case "export":
        return {
          ...stage,
          state: job.summary && job.transcript ? "active" : "idle",
        };
      default:
        return {
          ...stage,
          state: "idle",
        };
    }
  });
}

type PipelineStatusProps = {
  stages: PipelineStage[];
};

export function PipelineStatus({ stages }: PipelineStatusProps) {
  return (
    <ol className="pipeline-track" aria-label="Matter processing stages">
      {stages.map((stage) => (
        <li key={stage.id} className={`pipeline-step pipeline-step-${stage.state}`}>
          <span className="pipeline-marker" aria-hidden="true" />
          <div>
            <p className="pipeline-label">{stage.label}</p>
            <p className="pipeline-description">{stage.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
