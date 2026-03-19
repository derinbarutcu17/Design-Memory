# Design Memory

Design Memory is a local-first design-to-code audit tool.

It compares a Figma design reference against a GitHub pull request and points out where the implementation drifted.

It answers one question fast:
Is the implementation still matching the design?

## Workflow

1. Create a project with a Figma URL and a GitHub repo URL.
2. Sync the design reference from Figma.
3. Check the latest open PR, or choose one manually.
4. Review the drift issues and the Fix brief.
5. Paste the Fix brief into your coding agent.
6. Re-run the check after fixes.

## What it checks

- token mismatches
- hardcoded styles
- variant drift
- missing states
- obvious shared component reuse misses

## What it stores

- project links and parsed IDs
- synced Figma reference snapshots
- audit runs
- detected issues
- review status for each issue

## Setup

Create `.env.local` in the project root:

```bash
FIGMA_ACCESS_TOKEN=your_token_here
```

GitHub access comes from your local `gh` login.

Check auth:

```bash
gh auth status
```

Install and run:

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Running the app

- Use the dashboard to create a project.
- Add a Figma URL and a GitHub repo URL.
- Sync from Figma.
- Run a PR check.
- Review the Fix brief and drift evidence.

## Notes

- Figma sync needs a valid access token.
- Manual JSON import exists as a fallback, not the main path.
- The app is built to stay local-first and keep GitHub / Figma as connected inputs, not source-of-truth copies.
