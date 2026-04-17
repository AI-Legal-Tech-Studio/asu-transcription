import { LoginForm } from "@/components/login-form";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="login-page">
        <div className="login-card panel">
          <div className="login-header">
            <p className="eyebrow">ASU Law Clinics</p>
            <h1>Clinic Transcription</h1>
            <p className="lede">
              Upload audio from client interviews, depositions, or team debriefs
              and get a structured case brief.
            </p>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
