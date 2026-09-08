'use client';

/**
 * Client for local Ollama / LM Studio instances running on localhost.
 * Enables zero-cost offline local model inference in the Playground.
 */

export interface LocalOllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';

/**
 * List all models currently installed in the local Ollama daemon.
 */
export async function listLocalOllamaModels(
  endpoint = DEFAULT_OLLAMA_ENDPOINT
): Promise<LocalOllamaModel[]> {
  try {
    const url = `${endpoint.replace(/\/$/, '')}/api/tags`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.models) ? data.models : [];
  } catch (err) {
    return [];
  }
}

/**
 * Stream chat completions directly from local Ollama without server roundtrips or credit consumption.
 */
export async function streamLocalOllamaCompletion(options: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  endpoint?: string;
  onToken: (token: string) => void;
  signal?: AbortSignal;
}): Promise<{ fullText: string; promptTokens?: number; completionTokens?: number }> {
  const { model, messages, endpoint = DEFAULT_OLLAMA_ENDPOINT, onToken, signal } = options;
  const url = `${endpoint.replace(/\/$/, '')}/api/chat`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown local inference error');
    throw new Error(`Local model inference error (${res.status}): ${errText}`);
  }

  if (!res.body) {
    throw new Error('No readable stream returned from local Ollama endpoint.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.message?.content) {
          const chunk = parsed.message.content;
          fullText += chunk;
          onToken(chunk);
        }
        if (parsed.prompt_eval_count) {
          promptTokens = parsed.prompt_eval_count;
        }
        if (parsed.eval_count) {
          completionTokens = parsed.eval_count;
        }
      } catch {
        // Skip unparseable JSON stream line
      }
    }
  }

  return { fullText, promptTokens, completionTokens };
}
