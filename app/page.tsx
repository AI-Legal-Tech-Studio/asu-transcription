import Image from "next/image";

import { LoginForm } from "@/components/login-form";

type HomePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function getLoginErrorMessage(error?: string) {
  if (error === "invalid_credentials") {
    return "The email or password did not match a configured clinic account.";
  }

  if (error === "missing_config") {
    return "This deployment is missing the auth configuration required for sign-in.";
  }

  return null;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { error } = await searchParams;
  const errorMessage = getLoginErrorMessage(error);

  return (
    <main className="app-shell">
      <section className="access-layout">
        <div className="access-copy">
          <div className="brand-lockup">
            <Image
              alt="Clinic Transcription"
              className="brand-icon"
              height="48"
              src="/icon.svg"
              width="48"
            />
            <div>
              <p className="section-kicker">ASU Law Clinics</p>
              <h1>Clinic Transcription</h1>
            </div>
          </div>

          <p className="access-intro">
            Turn recorded intake, witness, and debrief conversations into
            reviewed legal work product without dragging the clinic team through
            another round of manual note reconstruction.
          </p>

          <div className="principles-grid">
            <section className="principle-block">
              <p className="section-kicker">Purpose</p>
              <h2>Built for matter review, not generic AI chat.</h2>
              <p className="muted-copy">
                The workbench is designed around chronology, issues, follow-up,
                and exportable records that attorneys and students can actually
                use.
              </p>
            </section>

            <section className="principle-block">
              <p className="section-kicker">Boundaries</p>
              <ul className="detail-list">
                <li>private sign-in and user-scoped history</li>
                <li>provider choice with local or cloud pathways</li>
                <li>structured outputs that can be reviewed and exported</li>
              </ul>
            </section>
          </div>

          <section className="specimen-sheet" aria-label="Work product preview">
            <div className="specimen-row">
              <div>
                <p className="section-kicker">Matter brief</p>
                <h3>Client intake review</h3>
              </div>
              <span className="status-chip status-chip-live">reviewable</span>
            </div>

            <div className="specimen-grid">
              <section className="specimen-block">
                <p className="section-kicker">Known now</p>
                <ul className="detail-list">
                  <li>parties, timeline, and immediate objectives</li>
                  <li>facts that sound material to the representation</li>
                  <li>tasks that cannot wait for a second read-through</li>
                </ul>
              </section>

              <section className="specimen-block">
                <p className="section-kicker">Still missing</p>
                <ul className="detail-list">
                  <li>dates that need confirmation</li>
                  <li>documents to collect from the client</li>
                  <li>questions for supervision before next action</li>
                </ul>
              </section>
            </div>
          </section>
        </div>

        <section className="access-panel">
          <p className="section-kicker">Secure access</p>
          <h2>Sign in to the clinic workbench.</h2>
          <p className="muted-copy">
            Use a configured clinic account to upload recordings, review saved
            matters, and export transcripts and brief artifacts.
          </p>

          {errorMessage ? <p className="inline-alert">{errorMessage}</p> : null}

          <LoginForm />
        </section>
      </section>
    </main>
  );
}
