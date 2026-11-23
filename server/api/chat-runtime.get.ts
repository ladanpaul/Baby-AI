import {
  buildOpenAiCompatibleEndpoint,
  buildOpenAiCompatibleHeaders,
} from '../utils/openai-compatible';

interface OpenAiCompatibleModelsResponse {
  data?: Array<{
    id?: string;
  }>;
  error?:
    | string
    | {
        message?: string;
      };
}

type ChatRuntimeMode = 'mock' | 'openai-compatible';
type ChatRuntimeStatus = 'ready' | 'connected' | 'unreachable';

function getRuntimeErrorMessage(payload: OpenAiCompatibleModelsResponse): string {
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (
    payload.error &&
    typeof payload.error === 'object' &&
    payload.error.message?.trim()
  ) {
    return payload.error.message.trim();
  }

  return 'The self-hosted chat runtime is unavailable.';
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const checkedAt = new Date().toISOString();

  if (config.chatRuntimeMode === 'mock') {
    return {
      mode: 'mock' as ChatRuntimeMode,
      status: 'ready' as ChatRuntimeStatus,
      model: 'dev-mock',
      endpoint: null,
      availableModels: ['dev-mock'],
      checkedAt,
      message: 'Built-in visual test runtime is active.',
    };
  }

  const endpoint = buildOpenAiCompatibleEndpoint(
    config.chatApiBaseUrl,
    config.chatModelsPath
  );

  try {
    const response = await fetch(endpoint, {
      headers: buildOpenAiCompatibleHeaders(config.chatApiKey),
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json()) as OpenAiCompatibleModelsResponse;

    if (!response.ok) {
      return {
        mode: 'openai-compatible' as ChatRuntimeMode,
        status: 'unreachable' as ChatRuntimeStatus,
        model: config.chatModel,
        endpoint,
        availableModels: [],
        checkedAt,
        message: getRuntimeErrorMessage(payload),
      };
    }

    const availableModels = (payload.data || [])
      .map((entry) => entry.id?.trim() || '')
      .filter(Boolean);

    return {
      mode: 'openai-compatible' as ChatRuntimeMode,
      status: 'connected' as ChatRuntimeStatus,
      model: config.chatModel,
      endpoint,
      availableModels,
      checkedAt,
      message: availableModels.length
        ? 'Self-hosted text backend is reachable.'
        : 'Backend is reachable but did not report any models.',
    };
  } catch {
    return {
      mode: 'openai-compatible' as ChatRuntimeMode,
      status: 'unreachable' as ChatRuntimeStatus,
      model: config.chatModel,
      endpoint,
      availableModels: [],
      checkedAt,
      message: 'Could not reach the configured self-hosted chat runtime.',
    };
  }
});
