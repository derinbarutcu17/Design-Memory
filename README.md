# @derin/design-memory

Design Memory blocks net-new design policy violations and reference mismatches in React/Tailwind PRs with deterministic checks first.

This repo is currently documented as a local-first CLI tool. It is not published to npm yet, so the primary install path is local development plus `npm link`.

## What It Is

- CLI-first enforcement for React/Tailwind repos
- PR-gate-first workflow
- deterministic checks before any AI assistance
- canonical reference snapshots as the source of truth
- baseline and review memory so teams only block on net-new drift

## What It Is Not

- not full visual QA yet
- not universal frontend enforcement for every stack
- not a prompt wrapper pretending to be a rule engine

## Core Commands

```bash
design-memory init
design-memory sync-reference
design-memory audit
design-memory scan --pr=123
design-memory review
design-memory compare
design-memory ghost
```

`ghost` is optional. It is not part of the primary workflow.

## Local Development Install

From this repository:

```bash
cd /path/to/design-memory
npm install
npm run build
npm link
```

Verify:

```bash
design-memory --help
```

## Use It In Another Repo

From the target React/Tailwind repository:

```bash
cd /path/to/target-repo
design-memory init
design-memory sync-reference
git add .
design-memory audit
```

For agent tooling or remote orchestration, the same commands accept `--cwd /absolute/path/to/repo`.

## Canonical Config

`design-memory init` writes `design-memory.config.json` if it does not exist.

```json
{
  "strictness": "block",
  "stateDir": ".design-memory",
  "reference": {
    "sourceType": "design-md",
    "path": "./DESIGN.md",
    "figmaFileKey": "",
    "figmaUrl": "",
    "stitchPath": "",
    "strictDesignMd": false
  },
  "include": ["src/components/**/*.tsx", "src/app/**/*.tsx"],
  "exclude": ["src/lib/**", "**/*.test.tsx", "**/*.test.ts"],
  "rules": {
    "color.raw-hex": "error",
    "tailwind.arbitrary-spacing": "error",
    "tailwind.arbitrary-radius": "error",
    "tailwind.arbitrary-font-size": "warn",
    "style.inline": "error",
    "token.mismatch": "error",
    "component.required-pattern": "error",
    "component.disallowed-pattern": "error",
    "component.variant-drift": "warn",
    "component.missing-state": "warn"
  },
  "baseline": {
    "mode": "net-new-only"
  },
  "llmFallback": {
    "enabled": false,
    "mode": "explain-only"
  },
  "ai": {
    "providerPreference": ["local", "anthropic", "openai"],
    "maxRetries": 1
  },
  "visualProvider": "none"
}
```

Set `"reference.strictDesignMd": true` if you want `DESIGN.md` parsing to only trust explicit contract lines such as `States: ...`, `Variants: ...`, `Must use: ...`, and `Disallowed: ...`.

## Reference Snapshot Flow

All design sources normalize into `.design-memory/reference-snapshot.json`.

Supported sources:

- `design-md` with lightweight token/component extraction from local markdown
- `stitch-markdown`
- `figma`

Sync the source of truth:

```bash
design-memory sync-reference
```

If no snapshot exists, `audit` and `scan` fail and tell you to run `design-memory sync-reference`.

## Local State

```text
.design-memory/
  reference-snapshot.json
  latest-run.json
  reviews.json
  baseline.json
  runs/
```

## Baseline Adoption Flow

Use this when adopting the tool in an existing repo:

```bash
design-memory sync-reference
git add .
design-memory audit --create-baseline
```

After that, blocking behavior is limited to net-new or reopened `error` findings.

## Audit Flow

```bash
git add .
design-memory audit
```

Behavior:

- no staged UI changes: exits clean
- no snapshot: exits with an explicit sync-reference error
- baseline creation: stores accepted current findings
- `warn` strictness: advisory only
- `block` strictness: blocks only on net-new or reopened `error` findings

## PR Scan Flow

Primary demo flow:

```bash
design-memory scan --pr=123
```

Requirements:

- target repo is a Git repo
- `gh` CLI is installed and authenticated
- a reference snapshot already exists

## Review Memory

List the latest findings:

```bash
design-memory review
```

Mark a finding:

```bash
design-memory review --fingerprint abc123 --status intentional --note "accepted for now"
```

Compare current state:

```bash
design-memory compare
```

## Deterministic Rule Engine

Current deterministic rule pack focuses on React/Tailwind drift:

- raw hex colors
- arbitrary Tailwind spacing values
- arbitrary Tailwind radius values
- arbitrary Tailwind font sizes
- inline styles
- token mismatch using snapshot aliases and code hints
- component required/disallowed patterns
- explicit variant drift and missing state checks where the snapshot is explicit

## AI Role

AI is off by default for blocking decisions.

Allowed uses:

- explain deterministic findings
- help with ambiguous mapping
- suggest fix wording

AI does not create blocking issues by default.

## Audit Output Schema

Machine-readable output is available via `--json`.

```json
{
  "id": "run_ab12cd34",
  "status": "completed",
  "summary": {
    "totalIssues": 1,
    "error": 1,
    "warn": 0,
    "byType": {
      "hardcoded-style": 1
    },
    "byStatus": {
      "new": 1
    }
  },
  "filesAnalyzed": ["src/components/Button.tsx"],
  "matchedComponents": [
    {
      "filePath": "src/components/Button.tsx",
      "componentName": "Button",
      "confidence": 0.98,
      "detectionSource": "deterministic"
    }
  ],
  "issues": [
    {
      "fingerprint": "a13bc9e2f9d1",
      "ruleId": "tailwind.arbitrary-radius",
      "issueType": "hardcoded-style",
      "severity": "error",
      "confidence": 0.98,
      "componentName": "Button",
      "filePath": "src/components/Button.tsx",
      "expected": "Use approved radius classes instead of arbitrary radius values.",
      "found": "rounded-[14px]",
      "evidenceSnippet": "className=\"rounded-[14px] px-4 py-2\"",
      "suggestedAction": "Replace rounded-[14px] with an approved radius token/class.",
      "detectionSource": "deterministic",
      "status": "new"
    }
  ]
}
```

## Hook Behavior

`design-memory init` installs a pre-commit hook that runs:

```bash
design-memory audit
```

If the commit is blocked, the hook prints:

```bash
git commit --no-verify
```

That is the escape hatch for false positives or urgent work.

## Verification

Run inside this repository:

```bash
npm run build
npm test
npm run lint
npm pack --dry-run
```
