# Clinic Transcription

Clinic Transcription is a production-ready web application for law clinics, legal aid organizations, public-interest teams, and attorney offices that need to turn recorded conversations into useful legal work product quickly and responsibly.

It provides a secure upload workflow, multiple transcription provider options, persistent job history, downloadable transcripts, and structured summaries designed for client intake, witness interviews, and related legal workflows.

## Why It Exists

Legal teams often have valuable information trapped inside interviews, consultations, debriefs, and recorded conversations. This project is built to help organizations move from raw audio to clear next steps faster, while keeping the experience professional enough for real-world legal service delivery.

The goal is simple: make high-quality AI-assisted transcription and summarization more accessible to the people and organizations doing public-facing legal work.

## Core Features

- secure login-protected workspace
- browser-based audio upload flow
- blob-backed uploads for larger files
- multiple transcription providers
- structured summary output tailored to legal review
- saved job history with detail views
- transcript and brief download support
- Vercel-friendly deployment with background workflow support

## Included Providers

- `gemini` for Google Gemini-based transcription, including a background workflow for long recordings
- `voxtral-openrouter` for OpenRouter-hosted Voxtral transcription
- `openai` for OpenAI Whisper-style transcription on smaller uploads
- `whisper-local` for pointing at a self-hosted faster-whisper HTTP endpoint

Summarization runs through OpenRouter against the model configured in `SUMMARY_MODEL`.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- PostgreSQL with Prisma (client types + direct `pg` queries for job persistence)
- Vercel Blob for large audio
- Vercel Workflow for durable background transcription

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   See [Environment Variables](#environment-variables) below for the minimum set required.

3. Provision your Postgres tables (the app creates two: `VoiceTranscriptionUser` and `VoiceTranscriptionJob`):

   ```bash
   npx prisma db push
   ```

4. Run the app locally:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) and sign in with one of the `AUTH_USER_*` accounts you configured.

## Environment Variables

At minimum, configure:

- `SESSION_SECRET` — a long random string used to sign session cookies.
- `AUTH_USER_1_EMAIL` and `AUTH_USER_1_PASSWORD_HASH` — a bcrypt hash, with `$` characters escaped as `\$` in the env file. Add `AUTH_USER_2_*`, `AUTH_USER_3_*`, etc. as needed.
- `DATABASE_URL` — Postgres connection string. `DATABASE_URL_UNPOOLED` is used by Prisma migrations when provided.
- `OPENROUTER_API_KEY` — required so the summary step can call the model configured in `SUMMARY_MODEL`.
- At least one transcription provider key: `GOOGLE_API_KEY` (Gemini), `OPENROUTER_API_KEY` (Voxtral), `OPENAI_API_KEY`, or `WHISPER_API_URL`.
- `BLOB_READ_WRITE_TOKEN` — required only if you want to send files larger than the request-body limit (mainly for the Gemini background workflow).

Use [`.env.example`](./.env.example) as the canonical reference.

## Generating a Password Hash

```bash
node -e "import('bcryptjs').then(b => b.default.hash(process.argv[1], 10).then(console.log))" 'your-password-here'
```

Copy the result into `AUTH_USER_N_PASSWORD_HASH`, escaping every `$` as `\$` so `.env` parsers don't treat them as variable references.

## Deploying on Vercel

1. Create a new Vercel project from this folder.
2. Add Vercel Postgres (or another Postgres) and Vercel Blob to the project and copy the resulting env vars.
3. Add the rest of the environment variables from `.env.example`.
4. Deploy. The first deploy should run `prisma db push` via your provider setup or you can run it locally against the production `DATABASE_URL_UNPOOLED` once.

Vercel Workflow routes for the Gemini background path are already configured in `vercel.json` with a long `maxDuration`.

## Product Positioning

This project is a strong fit for:

- law school clinics
- legal aid organizations
- pro bono teams
- public defenders
- attorney offices that need a clean internal transcription workflow

## Responsible Use

- Review all transcripts and summaries before using them in legal work.
- Do not treat generated output as legal advice.
- Confirm confidentiality, retention, and consent requirements for every deployment environment.

## Repository Contents

This folder is intentionally packaged as a clean release copy of the app. It excludes internal planning notes, tests, and local development clutter so it can be moved into a public repository without looking improvised.

## License

Released under the MIT License. See [LICENSE](./LICENSE).
