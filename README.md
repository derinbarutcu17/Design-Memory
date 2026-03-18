# Design Memory

Design Memory is a local-first Figma-to-PR review loop for AI-assisted implementation.

The product story is now:

1. Connect a Figma URL once.
2. Connect a GitHub repo URL once.
3. Click `Check latest PR`.
4. Design Memory syncs Figma, inspects the latest open PR, and generates a **Fix brief**.
5. Review the supporting **Drift evidence**.
6. Paste the Fix brief into your coding agent.
7. Recheck after fixes.

## What changed in this update

- setup now uses `Figma URL` and `GitHub repo URL`
- raw file key and repo owner/name are derived internally
- `Check latest PR` is the primary action
- `Choose PR manually` is the fallback path
- `Fix brief` is now the main output
- audit runs store whether the PR was auto-selected or manually chosen

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- SQLite via `better-sqlite3`
- GitHub access via local `gh api`
- Figma sync via the Figma REST API

## Required local setup

Create `.env.local` in the project root:

```bash
FIGMA_ACCESS_TOKEN=your_figma_personal_access_token
```

GitHub access still comes from your local CLI session:

```bash
gh auth status
```

Then run:

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Current workflow

### Normal path

1. Create a project with:
   - a project name
   - a Figma URL
   - a GitHub repo URL
2. Open the project.
3. Click `Check latest PR`.
4. The app will:
   - sync the latest Figma reference
   - find the latest updated open PR
   - inspect UI-related changed files
   - create an audit
   - open the audit page with the **Fix brief** first

### Fallback path

If the latest PR is not suitable:

- click `Choose PR manually`
- pick one of the recent open PRs
- or enter a PR number fallback

### Figma fallback/debug path

Manual normalized JSON import still exists under the fallback import section for:

- debugging normalization
- loading prepared snapshots
- temporary Figma API workarounds

It is not the main product path.

## Error handling behavior

- Invalid Figma URL: project creation/update is blocked with a clear message
- Invalid GitHub repo URL: project creation/update is blocked with a clear message
- Missing `FIGMA_ACCESS_TOKEN`: Figma sync is blocked
- No open PRs found: user is prompted to choose a PR manually
- Latest PR has no UI-related changes: user is prompted to choose a PR manually
- Figma sync failure: audit does not run against stale state

## What the app stores

Projects store:

- `figmaUrl`
- `repoUrl`
- derived `figmaFileKey`
- derived `repoOwner` and `repoName`

Audit runs store:

- PR number and title
- PR URL
- PR updated time
- whether the PR was `auto-latest` or `manual`

## What is intentionally deferred

- webhooks
- GitHub Actions
- background polling
- Figma plugin UI
- OAuth or multi-user auth
- screenshot diffing
- AI-generated recommendations
- autonomous code fixing
- VS Code integration
- MCP packaging

## Beginner demo instructions

### 1. Get your Figma URL

- Open your Figma file in the browser
- Copy the full URL from the address bar

Example:

```text
https://www.figma.com/design/ABC123456789/My-Design
```

### 2. Get your GitHub repo URL

- Open the GitHub repo in your browser
- Copy the full repo URL

Example:

```text
https://github.com/owner/repo
```

### 3. Start the app

```bash
cd /Users/derin/Desktop/CODING/design-memory
npm run dev
```

### 4. Create a project

Fill in:

- Project name
- Figma URL
- GitHub repo URL

### 5. Run the one-click flow

- Open the project
- Click `Check latest PR`

If everything is connected correctly, the app will:

- sync from Figma
- inspect the latest open PR
- show a **Fix brief**

### 6. Review the result

On the audit page:

- read the **Fix brief**
- inspect the **Drift evidence**
- mark issues as `valid`, `intentional`, or `ignore`

### 7. Use it with your coding agent

- click `Copy brief`
- paste the brief into your coding agent
- let the coding agent fix the implementation

### 8. Recheck

- return to the project
- click `Check latest PR` again
- open `Comparison` to see what improved

## Best demo setup

For the cleanest demo:

- use a React/Next/Tailwind repo
- use a PR that changes shared UI components
- use a Figma file with named components like Button, Input, Card
- choose a PR with visible drift such as:
  - hardcoded colors
  - missing focus/hover/disabled states
  - custom variants that do not match Figma
