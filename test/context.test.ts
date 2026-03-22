import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getDesignContext, resolveReferenceSnapshot } from '../src/lib/context';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'design-memory-context-'));
}

test('getDesignContext reads DESIGN.md and .cursorrules from cwd', async () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, 'DESIGN.md'), '# Spec\nUse spacing tokens.');
  fs.writeFileSync(path.join(cwd, '.cursorrules'), 'Always read design.md first.');

  const context = await getDesignContext({ cwd });
  assert.match(context, /DESIGN SPECIFICATION/);
  assert.match(context, /Use spacing tokens/);
  assert.match(context, /PROJECT RULES/);
  assert.match(context, /Always read design\.md first/);
});

test('resolveReferenceSnapshot loads design-md files from config.reference.path', async () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, 'spec.md'), '# Alternate spec\n## Button\n- Must use `bg-primary`\n- Do not use `style={{`\n- Supports hover and disabled states\n- Variants: primary, secondary\n');
  fs.writeFileSync(
    path.join(cwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'block',
      stateDir: '.design-memory',
      reference: {
        sourceType: 'design-md',
        path: './spec.md',
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
    }),
  );

  const snapshot = await resolveReferenceSnapshot(cwd);
  assert.equal(snapshot.metadata.source, 'design-md');
  assert.equal(snapshot.metadata.fileName, 'spec.md');
  assert.ok((snapshot.metadata.componentCount ?? 0) > 0);
  assert.equal(snapshot.metadata.stateCount, 0);
  assert.ok((snapshot.metadata.variantCount ?? 0) > 0);
  assert.ok(snapshot.components[0]?.requiredPatterns?.includes('bg-primary'));
  assert.ok(!snapshot.components[0]?.requiredPatterns?.includes('style={{'));
  assert.ok(snapshot.components[0]?.disallowedPatterns?.includes('style={{'));
});

test('resolveReferenceSnapshot only extracts states from explicit state lists', async () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, 'spec.md'), '# Alternate spec\n## Button\nNo disabled state yet.\nStates: hover, focus\n');
  fs.writeFileSync(
    path.join(cwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'block',
      stateDir: '.design-memory',
      reference: {
        sourceType: 'design-md',
        path: './spec.md',
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
    }),
  );

  const snapshot = await resolveReferenceSnapshot(cwd);
  assert.deepEqual(snapshot.components[0]?.states?.map((state) => state.name), ['hover', 'focus']);
});

test('resolveReferenceSnapshot supports strict design-md pattern extraction', async () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, 'spec.md'), '# Alternate spec\n## Button\n- Use `bg-primary`\n- Must use: `rounded-md`\n- Disallowed: `style={{`\n');
  fs.writeFileSync(
    path.join(cwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'block',
      stateDir: '.design-memory',
      reference: {
        sourceType: 'design-md',
        path: './spec.md',
        strictDesignMd: true,
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
    }),
  );

  const snapshot = await resolveReferenceSnapshot(cwd);
  assert.deepEqual(snapshot.components[0]?.requiredPatterns, ['rounded-md']);
  assert.deepEqual(snapshot.components[0]?.disallowedPatterns, ['style={{']);
});

test('resolveReferenceSnapshot throws when the configured source file is missing', async () => {
  const cwd = makeTempDir();
  fs.writeFileSync(
    path.join(cwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'block',
      stateDir: '.design-memory',
      reference: {
        sourceType: 'stitch-markdown',
        path: './missing.md',
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
    }),
  );

  await assert.rejects(resolveReferenceSnapshot(cwd), /No design source found/);
});
