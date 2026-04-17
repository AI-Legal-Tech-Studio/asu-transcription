import { redirect } from "next/navigation";

import { UploadWorkbench } from "@/components/upload-workbench";
import { getCurrentUser, isAuthenticated } from "@/lib/auth";
import { getSummaryModel } from "@/lib/config";

export default async function WorkspacePage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/");
  }

  const email = await getCurrentUser();

  return (
    <main className="shell">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Clinic Workbench</p>
          <h1>Upload a recording and draft a clinic-ready summary.</h1>
        </div>

        <div className="workspace-user">
          {email ? <span className="user-email">{email}</span> : null}
          <form action="/api/logout" method="post">
            <button className="ghost-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <UploadWorkbench summaryModel={getSummaryModel()} />
    </main>
  );
}
