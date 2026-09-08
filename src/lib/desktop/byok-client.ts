/**
 * Direct Client-Side BYOK (Bring Your Own Key) Engine
 * Directly streams responses from OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, xAI, and OpenRouter.
 * Provides instant ultra-low latency inference with zero server hops and automatic failover handling.
 */

import type { BYOKProvider } from './byok-store';
import type { PlaygroundChatMessage } from '../playground/types';

export interface BYOKStreamOptions {
  prompt: string;
  systemPrompt?: string;
  history?: PlaygroundChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

export interface BYOKStreamResult {
  fullText: string;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Resolves standard upstream API model IDs from internal playground model IDs.
 */
function resolveUpstreamModelId(modelId: string, provider: BYOKProvider): string {
  // Strip internal prefixes if present
  let cleanId = modelId.replace(/^ollama:|^local:|^byok:/, '');

  // Map known platform IDs to provider native endpoints
  const mapping: Record<string, string> = {
    // OpenAI
    'gpt-5-4': 'gpt-4o',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'o1': 'o1',
    'o3-mini': 'o3-mini',
    // Anthropic
    'claude-sonnet-5': 'claude-3-7-sonnet-20250219',
    'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
    // Google
    'gemini-3-flash': 'gemini-2.0-flash',
    'gemini-2.5-flash': 'gemini-2.0-flash',
    'gemini-2.5-pro': 'gemini-1.5-pro',
    // DeepSeek
    'deepseek-r1': 'deepseek-reasoner',
    'deepseek-v3': 'deepseek-chat',
    // Groq
    'llama-3.3-70b': 'llama-3.3-70b-versatile',
    'llama-3.1-8b': 'llama-3.1-8b-instant',
    // Mistral
    'mistral-large': 'mistral-large-latest',
    'codestral': 'codestral-latest',
    // xAI
    'grok-2': 'grok-2-latest',
  };

  if (mapping[cleanId]) return mapping[cleanId];
  return cleanId;
}

/**
 * Executes a direct BYOK stream to the target provider. Throws an error if the request fails (enabling backup fallback).
 */
export async function streamBYOKCompletion(
  modelId: string,
  keyInfo: { provider: BYOKProvider; key: string },
  opts: BYOKStreamOptions
): Promise<BYOKStreamResult> {
  const { provider, key } = keyInfo;
  const upstreamModel = resolveUpstreamModelId(modelId, provider);

  switch (provider) {
    case 'anthropic':
      return streamAnthropic(upstreamModel, key, opts);
    case 'google':
      return streamGoogleGemini(upstreamModel, key, opts);
    case 'openai':
    case 'deepseek':
    case 'groq':
    case 'openrouter':
    case 'mistral':
    case 'xai':
    default:
      return streamOpenAICompatible(provider, upstreamModel, key, opts);
  }
}

/**
 * OpenAI-Compatible streaming client (OpenAI, DeepSeek, Groq, OpenRouter, Mistral, xAI).
 */
async function streamOpenAICompatible(
  provider: BYOKProvider,
  model: string,
  apiKey: string,
  opts: BYOKStreamOptions
): Promise<BYOKStreamResult> {
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
  };

  const url = baseUrls[provider] || baseUrls.openai;

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  if (opts.history && opts.history.length > 0) {
    messages.push(...opts.history);
  }
  messages.push({ role: 'user', content: opts.prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://cybrdeck.com';
    headers['X-Title'] = 'Cybrdeck Playground';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(typeof opts.topP === 'number' ? { top_p: opts.topP } : {}),
      ...(typeof opts.maxTokens === 'number' ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`[BYOK ${provider}] HTTP ${response.status}: ${errBody || response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`[BYOK ${provider}] Response body is null`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            opts.onChunk(delta);
          }
        } catch {
          // ignore partial json chunks
        }
      }
    }
  }

  return { fullText };
}

/**
 * Anthropic Messages API streaming client.
 */
async function streamAnthropic(
  model: string,
  apiKey: string,
  opts: BYOKStreamOptions
): Promise<BYOKStreamResult> {
  const url = 'https://api.anthropic.com/v1/messages';

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (opts.history && opts.history.length > 0) {
    for (const msg of opts.history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: 'user', content: opts.prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      system: opts.systemPrompt || undefined,
      max_tokens: opts.maxTokens || 4096,
      stream: true,
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(typeof opts.topP === 'number' ? { top_p: opts.topP } : {}),
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`[BYOK Anthropic] HTTP ${response.status}: ${errBody || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('[BYOK Anthropic] Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta?.text || '';
            if (delta) {
              fullText += delta;
              opts.onChunk(delta);
            }
          }
        } catch {
          // ignore partial json chunks
        }
      }
    }
  }

  return { fullText };
}

/**
 * Google Gemini API streaming client.
 */
async function streamGoogleGemini(
  model: string,
  apiKey: string,
  opts: BYOKStreamOptions
): Promise<BYOKStreamResult> {
  const cleanModel = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  if (opts.history && opts.history.length > 0) {
    for (const msg of opts.history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({ role: 'user', parts: [{ text: opts.prompt }] });

  const body: any = { contents };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }
  if (typeof opts.temperature === 'number' || typeof opts.maxTokens === 'number') {
    body.generationConfig = {
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(typeof opts.maxTokens === 'number' ? { maxOutputTokens: opts.maxTokens } : {}),
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`[BYOK Google] HTTP ${response.status}: ${errBody || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('[BYOK Google] Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (delta) {
            fullText += delta;
            opts.onChunk(delta);
          }
        } catch {
          // ignore partial json chunks
        }
      }
    }
  }

  return { fullText };
}
