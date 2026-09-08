/**
 * Bring Your Own Key (BYOK) Client Store
 * Stores and manages user-provided API keys locally in the browser/desktop client.
 * Keys are NEVER transmitted or logged anywhere other than direct model inference requests.
 */

export type BYOKProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'mistral'
  | 'xai';

export interface BYOKProviderInfo {
  id: BYOKProvider;
  name: string;
  placeholder: string;
  docsUrl: string;
  brands: string[];
  keyPrefix?: string;
  description: string;
}

export const BYOK_PROVIDERS: BYOKProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    brands: ['OpenAI'],
    keyPrefix: 'sk-',
    description: 'Powers GPT-4o, GPT-4.5, o1, o3-mini, and all OpenAI models.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    brands: ['Anthropic'],
    keyPrefix: 'sk-ant-',
    description: 'Powers Claude 3.7 Sonnet, Claude 3.5 Haiku, Claude 3 Opus.',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    brands: ['Google'],
    keyPrefix: 'AIza',
    description: 'Powers Gemini 2.5 Pro, Gemini 2.5 Flash, and Gemini 2.0 Flash.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    brands: ['DeepSeek'],
    keyPrefix: 'sk-',
    description: 'Powers DeepSeek-V3 and DeepSeek-R1 reasoning models at extreme cost efficiency.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
    brands: ['OpenRouter', 'Meta', 'Mistral', 'Qwen', 'Z.ai', 'Moonshot', 'MiniMax'],
    keyPrefix: 'sk-or-',
    description: 'Unified gateway providing access to 200+ frontier and open-source models.',
  },
  {
    id: 'groq',
    name: 'Groq (LPU)',
    placeholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    brands: ['Groq', 'Meta'],
    keyPrefix: 'gsk_',
    description: 'Ultra-low latency inference for Llama 3, Mixtral, and DeepSeek distilled models.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    placeholder: '...',
    docsUrl: 'https://console.mistral.ai/api-keys',
    brands: ['Mistral'],
    description: 'Powers Mistral Large, Codestral, and Pixtral reasoning models.',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    placeholder: 'xai-...',
    docsUrl: 'https://console.x.ai',
    brands: ['xAI'],
    keyPrefix: 'xai-',
    description: 'Powers Grok 2, Grok 2 Vision, and Grok 3 models.',
  },
];

const STORAGE_KEY = '__cd_byok_keys_v1';

export type BYOKKeys = Partial<Record<BYOKProvider, string>>;

type Listener = (keys: BYOKKeys) => void;
const listeners = new Set<Listener>();

function notify(keys: BYOKKeys) {
  listeners.forEach((fn) => fn(keys));
}

/**
 * Loads all active BYOK keys from local client storage.
 */
export function getBYOKKeys(): BYOKKeys {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as BYOKKeys;
  } catch (err) {
    console.error('Failed to parse BYOK keys from storage:', err);
    return {};
  }
}

/**
 * Saves or updates a specific provider API key.
 */
export function setBYOKKey(provider: BYOKProvider, key: string): void {
  if (typeof window === 'undefined') return;
  const current = getBYOKKeys();
  const trimmed = key.trim();
  if (trimmed) {
    current[provider] = trimmed;
  } else {
    delete current[provider];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  notify(current);
}

/**
 * Clears a specific provider key.
 */
export function removeBYOKKey(provider: BYOKProvider): void {
  setBYOKKey(provider, '');
}

/**
 * Clears all BYOK keys.
 */
export function clearAllBYOKKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  notify({});
}

/**
 * Subscribes to BYOK key changes across tabs/windows.
 */
export function subscribeBYOKKeys(listener: Listener): () => void {
  listeners.add(listener);
  listener(getBYOKKeys());

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      listener(getBYOKKeys());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

/**
 * Resolves whether a given model has a custom BYOK key configured.
 * Checks provider brand mapping and OpenRouter fallback.
 */
export function getBYOKKeyForModel(
  modelId: string,
  modelBrand?: string,
  modelProvider?: string
): { provider: BYOKProvider; key: string } | null {
  const keys = getBYOKKeys();

  // 1. Direct provider match
  for (const info of BYOK_PROVIDERS) {
    const key = keys[info.id];
    if (!key) continue;

    if (modelBrand && info.brands.includes(modelBrand)) {
      return { provider: info.id, key };
    }

    if (modelProvider && info.id.toLowerCase() === modelProvider.toLowerCase()) {
      return { provider: info.id, key };
    }

    if (modelId.toLowerCase().includes(info.id.toLowerCase())) {
      return { provider: info.id, key };
    }
  }

  // 2. OpenRouter universal fallback
  if (keys.openrouter) {
    return { provider: 'openrouter', key: keys.openrouter };
  }

  return null;
}
