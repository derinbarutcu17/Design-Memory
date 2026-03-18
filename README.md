# Design Memory

Design Memory is a Figma-first design-to-code drift review workflow.

Phase 2 makes the product genuinely Figma-backed:

- projects store a real `figmaFileKey`
- the project page can now sync directly from the Figma API
- synced Figma data is normalized into the existing internal reference snapshot format
- GitHub PR audits still run locally through `gh api`
- review, fix brief export, and rerun comparison all stay deterministic

Manual JSON import still exists, but only as a fallback/debug path.

## Current workflow

1. Create a project with GitHub repo details and a Figma file key.
2. Click `Sync from Figma` on the project page.
3. Design Memory fetches the file from Figma and stores a new source-of-truth snapshot.
4. Run a GitHub PR audit.
5. Review the detected drift issues.
6. Copy the generated fix brief into your coding agent.
7. Re-run after fixes and compare the issue count.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- SQLite via `better-sqlite3`
- GitHub access via local `gh api`
- Figma sync via the Figma REST API

## Environment variables

Create a `.env.local` file in the project root:

```bash
FIGMA_ACCESS_TOKEN=your_figma_personal_access_token
```

GitHub auth is still provided by your local GitHub CLI login:

```bash
gh auth status
```

## Local setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Figma sync behavior

The primary path is now live Figma sync.

When you click `Sync from Figma`, the app:

- uses the project’s saved `figmaFileKey`
- calls the Figma REST API with `FIGMA_ACCESS_TOKEN`
- fetches file data and local variables where available
- normalizes components, variants, states, styles, and token-like references
- stores a new reference snapshot in SQLite

Normalization is intentionally conservative:

- it extracts what can be derived clearly
- it leaves uncertain fields empty instead of inventing precision
- it improves `codeMatches`, `aliases`, `tokensUsed`, and token hints for deterministic audits

## Manual import fallback

Manual JSON import is still available on the project page for:

- debugging normalization
- loading prepared reference payloads
- working around temporary Figma API issues

It is no longer the primary story.

## Supported drift checks

- `token-mismatch`
- `hardcoded-style`
- `variant-drift`
- `missing-state`
- `component-reuse` as a low-confidence heuristic only

## What is intentionally deferred

- Figma plugin UI
- OAuth or multi-user auth
- screenshot diffing
- AI-generated recommendations
- autonomous code fixes
- GitHub Actions or background jobs
- VS Code integration
- MCP server packaging

## Simple demo instructions for a complete beginner

### What you need first

You need:

- a GitHub repo with a pull request
- a Figma file
- a Figma personal access token

### How to get a Figma personal access token

1. Log into Figma in your browser.
2. Open Figma account settings.
3. Find the personal access token section.
4. Create a new token.
5. Copy it.
6. Put it into `.env.local` like this:

```bash
FIGMA_ACCESS_TOKEN=paste_your_token_here
```

### How to get the Figma file key

1. Open your Figma file in the browser.
2. Look at the URL.
3. It will look something like:

```text
https://www.figma.com/design/FILE_KEY/your-file-name
```

4. Copy the `FILE_KEY` part.

### How to run the demo

1. Start the app:

```bash
cd /Users/derin/Desktop/CODING/design-memory
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000)
3. Create a project.
4. Fill in:
   - project name
   - GitHub repo owner
   - GitHub repo name
   - Figma file key
5. On the project page, click `Sync from Figma`.
6. Wait for the success message.
7. Enter a PR number and click `Run PR audit`.
8. Open the audit report.
9. Mark issues as `valid`, `intentional`, or `ignore`.
10. Click `Copy brief`.
11. Paste that brief into your coding agent.
12. After the code is fixed, rerun the audit and open `Comparison`.

### Best demo setup

For the easiest believable demo:

- use a React/Next/Tailwind repo
- use a PR that changes a shared component
- choose a Figma file that clearly contains components like Button, Input, or Card
- use a PR with obvious drift like hardcoded colors, missing hover/focus states, or a custom variant
