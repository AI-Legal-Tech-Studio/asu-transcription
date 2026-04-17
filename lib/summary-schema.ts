import { z } from "zod";

const urgencySchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(["high", "medium", "low"]));

export const clinicSummarySchema = z.object({
  matterTitle: z.string(),
  executiveSummary: z.string(),
  speakers: z
    .array(
      z.object({
        label: z.string(),
        inferredRole: z.string().optional(),
      }),
    )
    .default([]),
  clientObjectives: z.array(z.string()),
  materialFacts: z.array(z.string()),
  legalIssues: z.array(z.string()),
  timeline: z.array(
    z.object({
      moment: z.string(),
      significance: z.string(),
    }),
  ),
  risks: z.array(z.string()),
  actionItems: z.array(
    z.object({
      owner: z.string(),
      task: z.string(),
      urgency: urgencySchema,
    }),
  ),
  followUpQuestions: z.array(z.string()),
  recommendedArtifacts: z.array(z.string()),
  confidentialityNotes: z.string(),
});

export type ClinicSummary = z.infer<typeof clinicSummarySchema>;
