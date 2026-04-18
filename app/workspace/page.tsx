import Image from "next/image";
import { redirect } from "next/navigation";

import { UploadWorkbench } from "@/components/upload-workbench";
import {
  getSummaryModel,
  hasBlobStoreConfig,
  hasDatabaseConfig,
  hasSummaryConfig,
} from "@/lib/config";
import { getCurrentUser, isAuthenticated } from "@/lib/auth";
import { getAvailableProviders, getDefaultProviderId } from "@/lib/providers";

export default async function WorkspacePage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/");
  }

  const email = await getCurrentUser();
  const providers = getAvailableProviders();

  return (
    <main className="app-shell workbench-page-shell">
      <header className="workspace-frame">
        <div className="workspace-title-group">
          <div className="brand-lockup brand-lockup-compact">
            <Image
              alt="Clinic Transcription"
              className="brand-icon"
              height="36"
              src="/icon.svg"
              width="36"
            />
            <div>
              <p className="section-kicker">ASU Law Clinics</p>
              <h1>Case workbench</h1>
            </div>
          </div>

          <p className="workspace-intro-copy">
            Upload a recording, review what the model extracted, and move from
            transcript to clinic-ready work product without losing the thread of
            the matter.
          </p>
        </div>

        <div className="workspace-session">
          {email ? <span className="session-identity">{email}</span> : null}
          <form action="/api/logout" method="post">
            <button className="secondary-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <UploadWorkbench
        currentUserEmail={email}
        defaultProviderId={getDefaultProviderId()}
        hasBlobStore={hasBlobStoreConfig()}
        hasDatabase={hasDatabaseConfig()}
        hasSummary={hasSummaryConfig()}
        initialProviders={providers}
        summaryModel={getSummaryModel()}
      />
    </main>
  );
}
