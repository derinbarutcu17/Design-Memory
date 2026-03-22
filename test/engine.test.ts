import test from 'node:test';
import assert from 'node:assert/strict';

import { detectAvailableBrain, promptBrain } from '../src/lib/engine';

test('detectAvailableBrain prefers local providers before API keys', async () => {
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'openai-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-key';

  const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
    const href = String(url);
    if (href.includes('11434')) {
      return new Response('{}', { status: 200 });
    }
    return new Response('no', { status: 500 });
  };

  const brain = await detectAvailableBrain(fakeFetch as typeof fetch);
  assert.deepEqual(brain, {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/api/generate',
    model: 'llama3',
  });

  process.env.OPENAI_API_KEY = oldOpenAI;
  process.env.ANTHROPIC_API_KEY = oldAnthropic;
});

test('detectAvailableBrain respects config provider preference ordering', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'design-memory-engine-'));
  fs.writeFileSync(
    path.join(cwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'warn',
      stateDir: '.design-memory',
      reference: { sourceType: 'design-md', path: './DESIGN.md' },
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
      ai: { providerPreference: ['openai', 'anthropic'], maxRetries: 1 },
      visualProvider: 'none',
    }),
  );

  const previous = process.cwd();
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.chdir(cwd);
  process.env.OPENAI_API_KEY = 'openai-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-key';

  try {
    const brain = await detectAvailableBrain((async () => new Response('no', { status: 500 })) as typeof fetch, cwd);
    assert.equal(brain?.provider, 'openai');
  } finally {
    process.chdir(previous);
    process.env.OPENAI_API_KEY = oldOpenAI;
    process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test('detectAvailableBrain uses the provided cwd instead of ambient process cwd', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'design-memory-engine-cwd-'));
  const targetCwd = path.join(workspace, 'target');
  const ambientCwd = path.join(workspace, 'ambient');
  fs.mkdirSync(targetCwd, { recursive: true });
  fs.mkdirSync(ambientCwd, { recursive: true });

  fs.writeFileSync(
    path.join(targetCwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'warn',
      stateDir: '.design-memory',
      reference: { sourceType: 'design-md', path: './DESIGN.md', strictDesignMd: false },
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
      ai: { providerPreference: ['anthropic', 'openai'], maxRetries: 1 },
      visualProvider: 'none',
    }),
  );

  fs.writeFileSync(
    path.join(ambientCwd, 'design-memory.config.json'),
    JSON.stringify({
      strictness: 'warn',
      stateDir: '.design-memory',
      reference: { sourceType: 'design-md', path: './DESIGN.md', strictDesignMd: false },
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
      ai: { providerPreference: ['openai', 'anthropic'], maxRetries: 1 },
      visualProvider: 'none',
    }),
  );

  const previous = process.cwd();
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.chdir(ambientCwd);
  process.env.OPENAI_API_KEY = 'openai-key';
  process.env.ANTHROPIC_API_KEY = 'anthropic-key';

  try {
    const brain = await detectAvailableBrain((async () => new Response('no', { status: 500 })) as typeof fetch, targetCwd);
    assert.equal(brain?.provider, 'anthropic');
  } finally {
    process.chdir(previous);
    process.env.OPENAI_API_KEY = oldOpenAI;
    process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test('promptBrain throws on non-ok provider responses', async () => {
  await assert.rejects(
    promptBrain(
      { provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
      'sys',
      'user',
      (async () => new Response('bad request', { status: 400 })) as typeof fetch,
    ),
    /Brain request failed \(400\): bad request/,
  );
});
