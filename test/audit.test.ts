import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAuditPrompt, compareRuns, reviewFinding, runAudit } from '../src/lib/audit';
import { saveReferenceSnapshot } from '../src/lib/state';
import type { ReferenceSnapshot } from '../src/lib/types';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'design-memory-audit-'));
}

function writeConfig(cwd: string, overrides: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(cwd, 'design-memory.config.json'), JSON.stringify({
    strictness: 'block',
    stateDir: '.design-memory',
    reference: {
      sourceType: 'design-md',
      path: './DESIGN.md',
    },
    include: [],
    exclude: [],
    rules: {
      'color.raw-hex': 'error',
      'tailwind.arbitrary-spacing': 'error',
      'tailwind.arbitrary-radius': 'error',
      'tailwind.arbitrary-font-size': 'warn',
      'style.inline': 'error',
      'token.mismatch': 'error',
      'component.required-pattern': 'error',
      'component.disallowed-pattern': 'error',
      'component.variant-drift': 'warn',
      'component.missing-state': 'warn',
    },
    baseline: { mode: 'net-new-only' },
    llmFallback: { enabled: false, mode: 'explain-only' },
    ai: { providerPreference: ['local'], maxRetries: 1 },
    visualProvider: 'none',
    ...overrides,
  }));
}

function writeSnapshot(cwd: string) {
  const snapshot: ReferenceSnapshot = {
    metadata: {
      source: 'stitch-design-md',
      versionLabel: 'Test snapshot',
      importedAt: new Date().toISOString(),
      tokenCount: 1,
      componentCount: 1,
    },
    tokens: [
      {
        name: 'color.button.primary',
        kind: 'color',
        value: '#00ff00',
        aliases: ['primary', 'button-primary'],
        codeHints: ['bg-primary', 'text-primary'],
      },
    ],
    components: [
      {
        name: 'Button',
        codeMatches: ['Button'],
        aliases: ['Button'],
        requiredPatterns: ['bg-primary'],
        disallowedPatterns: ['style={{'],
        states: [{ name: 'hover' }],
        variants: [{ name: 'primary' }],
        tokensUsed: ['color.button.primary'],
      },
    ],
    aliasMap: {
      'color.button.primary': ['primary', 'bg-primary', 'text-primary'],
    },
  };

  saveReferenceSnapshot(snapshot, cwd);
}

test('buildAuditPrompt contains deterministic facts contract', () => {
  const prompt = buildAuditPrompt(
    {
      metadata: { source: 'design-md', versionLabel: 'Spec' },
      tokens: [],
      components: [],
      aliasMap: {},
    },
    [],
    [],
  );
  assert.match(prompt.systemPrompt, /must not invent new blocking issues/i);
  assert.match(prompt.userPrompt, /DETERMINISTIC FACTS:/);
});

test('runAudit exits 1 when no reference snapshot exists', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);

  let exitCode: number | undefined;
  await runAudit({
    getDiff: () => 'FILE: Button.tsx\n+ className="bg-primary"\n',
    exit: ((code?: number) => {
      exitCode = code;
      return undefined as never;
    }) as typeof process.exit,
  }, { cwd });

  assert.equal(exitCode, 1);
});

test('runAudit creates a baseline and later only blocks on net-new error findings', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-[#ff0000]"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-[#ff0000]" />; }',
    exit,
  }, { cwd, createBaseline: true });

  assert.equal(exitCode, 0);

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-[#ff0000]"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-[#ff0000]" />; }',
    exit,
  }, { cwd });

  assert.equal(exitCode, 0);
});

test('runAudit blocks on net-new error findings and compare reports them', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="bg-primary hover:bg-primary" />; }',
    exit,
  }, { cwd, createBaseline: true });

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-primary style={{ color: "red" }}"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-primary hover:bg-primary style={{ color: \\"red\\" }}" />; }',
    exit,
  }, { cwd });

  assert.equal(exitCode, 1);
  const comparison = compareRuns(cwd);
  assert.ok(comparison.newFingerprints.length > 0);
});

test('reviewFinding stores intentional status and prevents blocking on unchanged finding', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-primary" />; }',
    exit,
  }, { cwd });

  const latestRun = JSON.parse(fs.readFileSync(path.join(cwd, '.design-memory', 'latest-run.json'), 'utf-8')) as { issues: Array<{ fingerprint: string }> };
  reviewFinding(latestRun.issues[0].fingerprint, 'intentional', 'accepted for now', cwd);

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-primary" />; }',
    exit,
  }, { cwd });

  assert.equal(exitCode, 0);
});

test('runAudit uses full file content for required pattern checks instead of only added lines', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ const changed = true\n',
    getFileContent: () => 'export function Button() { return <button className="bg-primary hover:bg-primary" />; }',
    exit,
  }, { cwd });

  assert.equal(exitCode, 0);
  const latestRun = JSON.parse(fs.readFileSync(path.join(cwd, '.design-memory', 'latest-run.json'), 'utf-8')) as { issues: Array<{ ruleId: string }> };
  assert.ok(!latestRun.issues.some((issue) => issue.ruleId === 'component.required-pattern'));
});

test('runAudit uses PR file contents for scan mode contract checks', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ const changed = true\n',
    exit,
  }, {
    cwd,
    mode: 'scan',
    prScan: {
      title: 'Test PR',
      url: 'https://example.com/pr/1',
      diff: 'FILE: src/components/Button.tsx\n+ const changed = true\n',
      files: [{ path: 'src/components/Button.tsx', content: 'export function Button() { return <button className="bg-primary hover:bg-primary" />; }' }],
    },
  });

  assert.equal(exitCode, 0);
  const latestRun = JSON.parse(fs.readFileSync(path.join(cwd, '.design-memory', 'latest-run.json'), 'utf-8')) as { issues: Array<{ ruleId: string }> };
  assert.ok(!latestRun.issues.some((issue) => issue.ruleId === 'component.required-pattern'));
});

test('runAudit marks issues as reopened when they return after skipping a run', async () => {
  const cwd = makeTempDir();
  writeConfig(cwd);
  writeSnapshot(cwd);

  let exitCode: number | undefined;
  const exit = ((code?: number) => {
    exitCode = code;
    return undefined as never;
  }) as typeof process.exit;

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-primary" />; }',
    exit,
  }, { cwd });

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="bg-primary hover:bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="bg-primary hover:bg-primary" />; }',
    exit,
  }, { cwd });

  await runAudit({
    getDiff: () => 'FILE: src/components/Button.tsx\n+ className="rounded-[14px] bg-primary"\n',
    getFileContent: () => 'export function Button() { return <button className="rounded-[14px] bg-primary" />; }',
    exit,
  }, { cwd });

  const latestRun = JSON.parse(fs.readFileSync(path.join(cwd, '.design-memory', 'latest-run.json'), 'utf-8')) as { issues: Array<{ status: string; ruleId: string }> };
  assert.ok(latestRun.issues.some((issue) => issue.ruleId === 'tailwind.arbitrary-radius' && issue.status === 'reopened'));
  assert.equal(exitCode, 1);
});
