import Link from "next/link";
import { notFound } from "next/navigation";

import {
  importReferenceAction,
  importSampleReferenceAction,
  runAuditAction,
  syncFigmaReferenceAction,
  updateProjectAction,
} from "@/app/actions";
import { Surface } from "@/components/ui";
import { sampleReferenceSnapshot } from "@/lib/sample-reference";
import { getProjectDetails } from "@/lib/store";
import { formatDate, prettyJson } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ status?: string; message?: string }>;
}) {
  const { projectId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const details = getProjectDetails(projectId);
  const hasFigmaToken = Boolean(process.env.FIGMA_ACCESS_TOKEN);

  if (!details) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#05121d,_#020617)] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
              Project workspace
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              {details.project.name}
            </h1>
            <p className="mt-3 text-slate-300">
              {details.project.repoOwner}/{details.project.repoName} · Figma file key{" "}
              {details.project.figmaFileKey}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
          >
            Back to dashboard
          </Link>
        </div>

        {resolvedSearchParams?.message ? (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm ${
              resolvedSearchParams.status === "error"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {resolvedSearchParams.message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Repository settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Keep the audit target current
            </h2>
            <form action={updateProjectAction} className="mt-6 space-y-4">
              <input type="hidden" name="projectId" value={details.project.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Repo owner</span>
                  <input
                    name="repoOwner"
                    defaultValue={details.project.repoOwner}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Repo name</span>
                  <input
                    name="repoName"
                    defaultValue={details.project.repoName}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Figma file key</span>
                <input
                  name="figmaFileKey"
                  defaultValue={details.project.figmaFileKey}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-white px-5 py-3 font-medium text-slate-950 transition hover:bg-slate-100"
              >
                Save project settings
              </button>
            </form>
          </Surface>

          <Surface>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Figma reference
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Sync the design source of truth from Figma
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">
                  Normal workflow: use the saved Figma file key and sync straight from the
                  Figma API. Manual JSON import stays below as a fallback or debug path.
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-300">
                    File key <span className="font-mono text-white">{details.project.figmaFileKey}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {hasFigmaToken
                      ? "FIGMA_ACCESS_TOKEN detected. Ready for live sync."
                      : "FIGMA_ACCESS_TOKEN missing. Add it before running live Figma sync."}
                  </p>
                </div>
                <form action={syncFigmaReferenceAction}>
                  <input type="hidden" name="projectId" value={details.project.id} />
                  <button
                    type="submit"
                    disabled={!hasFigmaToken}
                    className="rounded-full bg-sky-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-sky-400"
                  >
                    Sync from Figma
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Fallback import
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Use this only when debugging normalization or importing prepared reference
                  payloads.
                </p>
              </div>
              <form action={importSampleReferenceAction}>
                <input type="hidden" name="projectId" value={details.project.id} />
                <button
                  type="submit"
                  className="rounded-full border border-sky-300/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-500/20"
                >
                  Load sample fallback
                </button>
              </form>
            </div>

            <form action={importReferenceAction} className="mt-4 space-y-4">
              <input type="hidden" name="projectId" value={details.project.id} />
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">
                  Paste normalized Figma-derived reference JSON
                </span>
                <textarea
                  name="referenceJson"
                  defaultValue={prettyJson(sampleReferenceSnapshot)}
                  className="min-h-72 w-full rounded-[28px] border border-white/10 bg-[#020817] px-4 py-4 font-mono text-sm text-slate-200 outline-none transition focus:border-sky-400/60"
                />
              </label>
              <button
                type="submit"
                className="rounded-full border border-white/10 bg-white px-5 py-3 font-medium text-slate-950 transition hover:bg-slate-100"
              >
                Import fallback snapshot
              </button>
            </form>
          </Surface>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Reference summary
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              What the current design snapshot contains
            </h2>
            {details.latestSnapshot ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm text-slate-300">
                    Source: {details.latestSnapshot.sourceType}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Imported {formatDate(details.latestSnapshot.createdAt)}
                  </p>
                  {details.latestSnapshot.snapshot.metadata.fileName ? (
                    <p className="mt-1 text-sm text-slate-500">
                      Figma file {details.latestSnapshot.snapshot.metadata.fileName}
                    </p>
                  ) : null}
                  {details.latestSnapshot.snapshot.metadata.lastModified ? (
                    <p className="mt-1 text-sm text-slate-500">
                      Last modified{" "}
                      {formatDate(details.latestSnapshot.snapshot.metadata.lastModified)}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      Tokens
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {details.latestSnapshot.snapshot.metadata.tokenCount ??
                        details.latestSnapshot.snapshot.tokens.length}{" "}
                      extracted token/style references
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-200">
                      {details.latestSnapshot.snapshot.tokens.map((token) => (
                        <li key={token.name}>
                          {token.name}
                          {token.codeHints?.length ? (
                            <span className="block text-slate-500">
                              {token.codeHints.join(", ")}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      Components
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {details.latestSnapshot.snapshot.metadata.componentCount ??
                        details.latestSnapshot.snapshot.components.length}{" "}
                      extracted Figma components
                    </p>
                    <ul className="mt-4 space-y-3 text-sm text-slate-200">
                      {details.latestSnapshot.snapshot.components.map((component) => (
                        <li key={component.name}>
                          <span className="font-medium text-white">{component.name}</span>
                          <span className="mt-1 block text-slate-500">
                            {(component.variants ?? []).length} variants ·{" "}
                            {(component.states ?? []).length} states
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
                No reference snapshot yet. The normal path is to sync from Figma using the
                saved file key. Fallback JSON import is still available above if you need it.
              </p>
            )}
          </Surface>

          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Run audit
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Inspect a live GitHub pull request
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              This V1 uses your local authenticated <code className="rounded bg-white/10 px-1 py-0.5">gh</code>{" "}
              session to fetch PR metadata, changed UI files, patches, and current file contents.
            </p>
            <form action={runAuditAction} className="mt-6 flex flex-wrap items-end gap-4">
              <input type="hidden" name="projectId" value={details.project.id} />
              <label className="block max-w-[220px] flex-1">
                <span className="mb-2 block text-sm text-slate-300">PR number</span>
                <input
                  name="prNumber"
                  type="number"
                  min={1}
                  required
                  disabled={!details.latestSnapshot}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="42"
                />
              </label>
              <button
                type="submit"
                disabled={!details.latestSnapshot}
                className="rounded-full bg-white px-5 py-3 font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run PR audit
              </button>
            </form>
            <div className="mt-8">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                Previous runs
              </p>
              <div className="mt-4 space-y-3">
                {details.auditRuns.length === 0 ? (
                  <p className="rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
                    No audits yet for this project.
                  </p>
                ) : null}
                {details.auditRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/audits/${run.id}`}
                    className="block rounded-3xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-sky-300/30 hover:bg-white/[0.05]"
                  >
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      {formatDate(run.createdAt)}
                    </p>
                    <h3 className="mt-2 text-lg font-medium text-white">
                      PR #{run.prNumber} · {run.prTitle}
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                      {run.summary.totalIssues} issues · {run.summary.high} high ·{" "}
                      {run.summary.medium} medium · {run.summary.low} low
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </main>
  );
}
