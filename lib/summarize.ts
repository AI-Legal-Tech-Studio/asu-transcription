import { getSummaryModel, hasSummaryConfig } from "@/lib/config";
import {
  extractOpenRouterText,
  getOpenRouterHeaders,
  parseOpenRouterResponse,
} from "@/lib/openrouter";
import { extractJsonValue, type SpeakerSegment } from "@/lib/providers/types";
import { clinicSummarySchema, type ClinicSummary } from "@/lib/summary-schema";

type SummarizeTranscriptInput = {
  focus: string;
  matterType: string;
  transcript: string;
  segments?: SpeakerSegment[];
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => readString(item))
      .filter(Boolean);
  }

  const single = readString(value);
  return single ? [single] : [];
}

function normalizeSpeakers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ label }] : [];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const speaker = item as Record<string, unknown>;
    const label =
      readString(speaker.label) ||
      readString(speaker.name) ||
      readString(speaker.speaker) ||
      readString(speaker.title);
    const inferredRole =
      readString(speaker.inferredRole) ||
      readString(speaker.role) ||
      readString(speaker.description);

    if (!label) {
      return [];
    }

    return [
      inferredRole ? { label, inferredRole } : { label },
    ];
  });
}

function normalizeTimeline(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") {
        const significance = item.trim();
        return significance
          ? [{ moment: "Not specified", significance }]
          : [];
      }

      if (!item || typeof item !== "object") {
        return [];
      }

      const entry = item as Record<string, unknown>;
      const moment =
        readString(entry.moment) ||
        readString(entry.time) ||
        readString(entry.date) ||
        readString(entry.phase) ||
        "Not specified";
      const significance =
        readString(entry.significance) ||
        readString(entry.event) ||
        readString(entry.description) ||
        readString(entry.summary);

      return significance ? [{ moment, significance }] : [];
    });
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const entry = value as Record<string, unknown>;
  const transformationEstimate =
    readString(entry.transformationEstimate) || "Not specified";

  if (Array.isArray(entry.keyMilestones)) {
    return entry.keyMilestones.flatMap((item) => {
      const significance = readString(item);
      return significance
        ? [{ moment: transformationEstimate, significance }]
        : [];
    });
  }

  return Object.entries(entry).flatMap(([moment, significance]) => {
    const normalizedSignificance = readString(significance);
    return normalizedSignificance
      ? [{ moment, significance: normalizedSignificance }]
      : [];
  });
}

function normalizeActionItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const task = item.trim();
      return task
        ? [{ owner: "Clinic Team", task, urgency: "medium" }]
        : [];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const action = item as Record<string, unknown>;
    const owner =
      readString(action.owner) ||
      readString(action.assignee) ||
      readString(action.responsibleParty) ||
      "Clinic Team";
    const task =
      readString(action.task) ||
      readString(action.action) ||
      readString(action.description) ||
      readString(action.item);
    const urgency = readString(action.urgency) || readString(action.priority) || "medium";

    return task ? [{ owner, task, urgency }] : [];
  });
}

function normalizeSummaryPayload(value: unknown) {
  const summary = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  return {
    matterTitle:
      readString(summary.matterTitle) ||
      readString(summary.title) ||
      readString(summary.subject) ||
      "Untitled matter",
    executiveSummary:
      readString(summary.executiveSummary) ||
      readString(summary.summary) ||
      readString(summary.overview) ||
      "Summary unavailable.",
    speakers: normalizeSpeakers(summary.speakers),
    clientObjectives: normalizeStringArray(summary.clientObjectives),
    materialFacts: normalizeStringArray(summary.materialFacts),
    legalIssues: normalizeStringArray(summary.legalIssues),
    timeline: normalizeTimeline(summary.timeline),
    risks: normalizeStringArray(summary.risks),
    actionItems: normalizeActionItems(summary.actionItems),
    followUpQuestions: normalizeStringArray(summary.followUpQuestions),
    recommendedArtifacts: normalizeStringArray(summary.recommendedArtifacts),
    confidentialityNotes:
      readString(summary.confidentialityNotes) ||
      readString(summary.confidentialityNote) ||
      "Review transcript and summary before sharing externally.",
  };
}

function buildSpeakerContext(segments: SpeakerSegment[] | undefined) {
  if (!segments?.length) {
    return "No structured speaker segments were available.";
  }

  return segments
    .slice(0, 40)
    .map((segment) => {
      const speaker = segment.speaker?.trim() || "Speaker";
      return `${speaker}: ${segment.text}`;
    })
    .join("\n");
}

export async function summarizeTranscript({
  focus,
  matterType,
  transcript,
  segments,
}: SummarizeTranscriptInput): Promise<ClinicSummary> {
  if (!hasSummaryConfig()) {
    throw new Error("OpenRouter summarization is not configured on this deployment.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify({
      model: getSummaryModel(),
      messages: [
        {
          role: "system",
          content: [
            "You are an expert clinical legal education assistant.",
            "Draft structured summaries for law school clinics from client or team audio.",
            "Be precise, avoid speculation, and clearly separate facts from open questions.",
            "Assume the audience is a supervising attorney and student-attorney team.",
            "If the transcript contains speakers, use them in the summary and populate the speakers array.",
            "Return JSON only with no markdown or commentary.",
            "Use exactly these top-level keys: matterTitle, executiveSummary, speakers, clientObjectives, materialFacts, legalIssues, timeline, risks, actionItems, followUpQuestions, recommendedArtifacts, confidentialityNotes.",
            "Use lowercase urgency values in actionItems: high, medium, or low.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Matter type: ${matterType || "General intake"}`,
            focus
              ? `Requested focus from the clinic team: ${focus}`
              : "Requested focus from the clinic team: none supplied.",
            "Speaker context:",
            buildSpeakerContext(segments),
            "Transcript:",
            transcript,
            "Return a single JSON object only.",
          ].join("\n\n"),
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0,
      max_tokens: 2500,
    }),
  });
  const payload = await parseOpenRouterResponse(response);
  const content = extractOpenRouterText(payload);

  return clinicSummarySchema.parse(
    normalizeSummaryPayload(extractJsonValue(content)),
  );
}
