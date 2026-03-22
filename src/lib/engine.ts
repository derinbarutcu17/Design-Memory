export type BrainProvider = 'ollama' | 'lm-studio' | 'openai' | 'anthropic';

export interface BrainConfig {
  provider: BrainProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

type FetchLike = typeof fetch;

function readProviderPreference(cwd = process.cwd()) {
  try {
    const configPath = `${cwd}/design-memory.config.json`;
    const fs = require('node:fs') as typeof import('node:fs');
    if (!fs.existsSync(configPath)) {
      return ['local', 'anthropic', 'openai'] as const;
    }

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      ai?: { providerPreference?: Array<'local' | 'anthropic' | 'openai'> };
    };
    return raw.ai?.providerPreference?.length
      ? raw.ai.providerPreference
      : (['local', 'anthropic', 'openai'] as const);
  } catch {
    return ['local', 'anthropic', 'openai'] as const;
  }
}

async function isReachable(url: string, fetchFn: FetchLike) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);

  try {
    const res = await fetchFn(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function detectAvailableBrain(fetchFn: FetchLike = fetch, cwd = process.cwd()): Promise<BrainConfig | null> {
  const preferences = readProviderPreference(cwd);

  if (preferences.includes('local')) {
    if (await isReachable('http://localhost:11434/api/tags', fetchFn)) {
      return { provider: 'ollama', baseUrl: 'http://localhost:11434/api/generate', model: 'llama3' };
    }

    if (await isReachable('http://localhost:1234/v1/models', fetchFn)) {
      return { provider: 'lm-studio', baseUrl: 'http://localhost:1234/v1/chat/completions' };
    }
  }

  for (const preference of preferences) {
    if (preference === 'openai' && process.env.OPENAI_API_KEY) {
      return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' };
    }

    if (preference === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-5-sonnet-20240620' };
    }
  }

  return null;
}

async function getJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brain request failed (${response.status}): ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function promptBrain(
  config: BrainConfig,
  system: string,
  user: string,
  fetchFn: FetchLike = fetch,
): Promise<string> {
  if (config.provider === 'ollama') {
    const res = await fetchFn(config.baseUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'llama3',
        system,
        prompt: user,
        stream: false,
        format: 'json'
      })
    });
    const data = await getJson<{ response: string }>(res);
    return data.response;
  }

  if (config.provider === 'lm-studio') {
    const res = await fetchFn(config.baseUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' }
      })
    });
    const data = await getJson<{ choices: Array<{ message: { content: string } }> }>(res);
    return data.choices[0].message.content;
  }

  if (config.provider === 'openai') {
    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' }
      })
    });
    const data = await getJson<{ choices: Array<{ message: { content: string } }> }>(res);
    return data.choices[0].message.content;
  }

  if (config.provider === 'anthropic') {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        system,
        messages: [
          { role: 'user', content: user }
        ]
      })
    });
    const data = await getJson<{ content: Array<{ text: string }> }>(res);
    return data.content[0].text;
  }

  throw new Error(`Unsupported brain provider: ${config.provider}`);
}
