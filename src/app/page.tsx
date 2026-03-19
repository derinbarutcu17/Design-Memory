import Link from "next/link";

import { createProjectAction } from "@/app/actions";
import { listAuditRuns, listProjects } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function DashboardStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111419] px-6 py-6">
      <div>
        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </span>
        <div className="mt-3 font-[family:var(--font-display)] text-4xl font-semibold text-slate-50">
          {value}
        </div>
      </div>
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        ●
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const projects = listProjects();
  const auditRuns = projects.flatMap((project) =>
    listAuditRuns(project.id).slice(0, 3).map((run) => ({ project, run })),
  );

  return (
    <main className="min-h-screen bg-[#0c0e12] text-slate-100">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-white/[0.05] bg-[#0c0e12] lg:flex lg:flex-col lg:px-8 lg:py-8">
        <div className="mb-12">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#89ceff]/15 text-[#89ceff]">
              <span className="text-sm font-semibold">◎</span>
            </div>
            <h1 className="font-[family:var(--font-display)] text-lg font-semibold tracking-tight text-slate-50">
              Design Memory
            </h1>
          </div>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          <a
            href="#overview"
            className="flex items-center gap-3 rounded-lg bg-[#89ceff]/6 px-4 py-2.5 font-medium text-[#89ceff]"
          >
            <span className="text-base">●</span>
            Dashboard
          </a>
          <a
            href="#projects"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <span className="text-base">●</span>
            Projects
          </a>
          <a
            href="#audits"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <span className="text-base">●</span>
            Audit Runs
          </a>
          <a
            href="#create"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <span className="text-base">●</span>
            Create Project
          </a>
        </nav>

        <div className="border-t border-white/[0.05] pt-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-600">
            Local-first review loop
          </p>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.05] bg-[#0c0e12]/85 px-6 backdrop-blur-md lg:px-10">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Overview</p>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <span className="rounded-full border border-white/[0.06] bg-[#16191d] px-3 py-1 text-xs text-slate-300">
                {projects.length} projects
              </span>
              <span className="rounded-full border border-white/[0.06] bg-[#16191d] px-3 py-1 text-xs text-slate-300">
                {auditRuns.length} recent audits
              </span>
            </div>
          </div>
          <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
            Design reference → PR audit → Fix brief
          </p>
        </header>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-6 py-10 lg:px-12">
          {resolvedSearchParams?.message ? (
            <div
              className={`rounded-xl border px-5 py-4 text-sm ${
                resolvedSearchParams.status === "error"
                  ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                  : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {resolvedSearchParams.message}
            </div>
          ) : null}

          <div className="grid grid-cols-12 gap-12">
            <div className="col-span-12 space-y-12 lg:col-span-8">
              <section id="overview" className="space-y-6">
                <div className="space-y-3">
                  <h2 className="font-[family:var(--font-display)] text-5xl font-bold tracking-tight text-slate-50">
                    Design <span className="text-[#89ceff]/85">Memory</span>
                  </h2>
                  <p className="max-w-2xl text-lg font-light leading-relaxed text-slate-400">
                    Sync the Figma reference, inspect the latest implementation PR, and hand
                    back a clean Fix brief.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href="#create"
                    className="rounded-lg bg-[#89ceff] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[#001e2f] transition-all hover:-translate-y-0.5 hover:bg-[#bce4ff]"
                  >
                    Create project
                  </a>
                  <a
                    href="#projects"
                    className="rounded-lg border border-white/[0.06] bg-[#16191d] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition-colors hover:bg-white/5"
                  >
                    Browse projects
                  </a>
                </div>
              </section>

              <div className="grid gap-8 md:grid-cols-2">
                <DashboardStat label="Active Projects" value={projects.length} accent="#89ceff" />
                <DashboardStat label="Audit Runs" value={auditRuns.length} accent="#c0c1ff" />
              </div>

              <section id="audits" className="space-y-6">
                <div className="flex items-end justify-between border-b border-white/[0.05] pb-4">
                  <h3 className="font-[family:var(--font-display)] text-xl font-semibold text-slate-50">
                    Recent Audit Runs
                  </h3>
                  <span className="text-xs font-medium text-[#89ceff]">
                    Latest PR by default
                  </span>
                </div>
                <div className="space-y-3">
                  {auditRuns.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-[#111419] p-5 text-sm text-slate-400">
                      Audit runs show up here after the first PR check.
                    </div>
                  ) : null}
                  {auditRuns.map(({ project, run }) => (
                    <Link
                      key={run.id}
                      href={`/audits/${run.id}`}
                      className="group flex items-center gap-5 rounded-xl border border-white/[0.06] p-5 transition-all hover:bg-white/5"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#89ceff]/10 text-[#89ceff]">
                        <span className="text-lg">↗</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-100">
                          {project.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {run.prSelectionMode === "auto-latest" ? "Latest PR" : "Manual PR"} · #
                          {run.prNumber} · {formatDate(run.createdAt)}
                        </div>
                      </div>
                      <div className="rounded-full bg-[#89ceff]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#89ceff]">
                        {run.summary.totalIssues} issues
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section id="projects" className="space-y-6">
                <div className="flex items-end justify-between border-b border-white/[0.05] pb-4">
                  <h3 className="font-[family:var(--font-display)] text-xl font-semibold text-slate-50">
                    Project Workspaces
                  </h3>
                  <span className="text-xs text-slate-500">Connected once, reused often</span>
                </div>
                <div className="space-y-3">
                  {projects.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-[#111419] p-5 text-sm text-slate-400">
                      No projects yet. Create one to connect a Figma URL and GitHub repo.
                    </div>
                  ) : null}
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="block rounded-xl border border-white/[0.06] bg-[#111419] p-5 transition-all hover:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-base font-semibold text-slate-50">
                            {project.name}
                          </h4>
                          <p className="mt-2 text-sm text-slate-400">
                            {project.repoOwner}/{project.repoName}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Figma connected via URL · audit workflow enabled
                          </p>
                        </div>
                        <span className="rounded-full border border-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                          Open
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <div className="col-span-12 lg:col-span-4">
              <div
                id="create"
                className="sticky top-24 space-y-8 rounded-xl border border-white/[0.06] bg-[#16191d] p-8"
              >
                <div className="space-y-1">
                  <h3 className="font-[family:var(--font-display)] text-xl font-semibold text-slate-50">
                    Create Project
                  </h3>
                  <p className="text-xs font-light text-slate-500">
                    Connect your design reference and implementation repo.
                  </p>
                </div>

                <form action={createProjectAction} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Project Name
                    </label>
                    <input
                      name="name"
                      required
                      placeholder="e.g. Project Obsidian"
                      className="w-full rounded-lg border border-white/[0.06] bg-[#1e2124]/50 px-4 py-3 text-sm text-slate-100 outline-none transition-all focus:border-[#89ceff]/40 focus:ring-1 focus:ring-[#89ceff]/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Figma URL
                    </label>
                    <input
                      name="figmaUrl"
                      required
                      placeholder="https://www.figma.com/design/..."
                      className="w-full rounded-lg border border-white/[0.06] bg-[#1e2124]/50 px-4 py-3 text-sm text-slate-100 outline-none transition-all focus:border-[#89ceff]/40 focus:ring-1 focus:ring-[#89ceff]/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      GitHub Repo URL
                    </label>
                    <input
                      name="repoUrl"
                      required
                      placeholder="https://github.com/owner/repo"
                      className="w-full rounded-lg border border-white/[0.06] bg-[#1e2124]/50 px-4 py-3 text-sm text-slate-100 outline-none transition-all focus:border-[#89ceff]/40 focus:ring-1 focus:ring-[#89ceff]/20"
                    />
                  </div>

                  <div className="space-y-4">
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-[#89ceff] py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-[#001e2f] transition-all hover:-translate-y-0.5 hover:bg-[#bce4ff]"
                    >
                      Create Project
                    </button>
                    <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
                      Real links only · no fake setup steps
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
