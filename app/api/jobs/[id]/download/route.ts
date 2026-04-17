import { NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";

import { getCurrentUser } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/config";
import { loadStoredJobForUser } from "@/lib/job-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getTranscriptText(job: {
  transcript: string | null;
  speakerSegments: unknown;
}) {
  const segments = job.speakerSegments;

  if (Array.isArray(segments) && segments.length > 0) {
    return segments
      .map((segment: { speaker?: string; text?: string }) => {
        const speaker = segment.speaker?.trim() || "Speaker";
        return `${speaker}: ${segment.text ?? ""}`;
      })
      .join("\n\n");
  }

  return job.transcript ?? "";
}

function sanitizeFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function buildDocx(transcript: string, fileName: string) {
  const paragraphs = transcript.split(/\n{2,}/).filter((p) => p.trim());

  const children = [
    new Paragraph({
      text: fileName.replace(/\.[^.]+$/, ""),
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Transcribed on ${new Date().toLocaleDateString()}`,
          italics: true,
          color: "666666",
        }),
      ],
      spacing: { after: 300 },
    }),
    ...paragraphs.map(
      (text) =>
        new Paragraph({
          children: [new TextRun(text.trim())],
          spacing: { after: 200 },
        }),
    ),
  ];

  return new Document({
    sections: [{ children }],
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json(
      { error: "Database persistence is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "txt";

  const { id } = await params;
  const job = await loadStoredJobForUser(id, userEmail);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const transcript = getTranscriptText(job);

  if (!transcript) {
    return NextResponse.json(
      { error: "This job does not have a transcript yet." },
      { status: 404 },
    );
  }

  const baseName = sanitizeFileName(job.fileName) || "transcript";

  if (format === "docx") {
    const doc = buildDocx(transcript, job.fileName);
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${baseName}.docx"`,
      },
    });
  }

  return new Response(transcript, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.txt"`,
    },
  });
}
