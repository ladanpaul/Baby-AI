import { createError } from 'h3';

export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function normalizeOpenAiCompatiblePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function buildOpenAiCompatibleEndpoint(baseUrl: string, path: string): string {
  return `${normalizeOpenAiCompatibleBaseUrl(baseUrl)}${normalizeOpenAiCompatiblePath(path)}`;
}

export function buildOpenAiCompatibleHeaders(apiKey: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

export type OpenAiCompatibleRole = 'system' | 'user' | 'assistant';

export interface OpenAiCompatibleTextMessage {
  role: OpenAiCompatibleRole;
  content: string;
}

interface OpenAiCompatibleMessagePart {
  type?: string;
  text?: string;
}

interface OpenAiCompatibleChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | OpenAiCompatibleMessagePart[];
      reasoning_content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?:
    | string
    | {
        message?: string;
      };
}

export interface OpenAiCompatibleTextResult {
  model: string;
  content: string;
  thinking?: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
  };
}

function extractAssistantContent(
  content: string | OpenAiCompatibleMessagePart[] | undefined
): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getUpstreamErrorMessage(payload: OpenAiCompatibleChatResponse): string {
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

  return 'The self-hosted chat runtime returned an error.';
}

export async function requestOpenAiCompatibleText(params: {
  apiKey: string;
  endpoint: string;
  messages: OpenAiCompatibleTextMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAiCompatibleTextResult> {
  let response: Response;

  try {
    response = await fetch(params.endpoint, {
      method: 'POST',
      headers: buildOpenAiCompatibleHeaders(params.apiKey),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: false,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.maxTokens,
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 120_000),
    });
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: `Could not reach the self-hosted chat runtime at ${params.endpoint}. Start an OpenAI-compatible server and confirm the endpoint is available.`,
    });
  }

  const payload = (await response.json()) as OpenAiCompatibleChatResponse;

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: getUpstreamErrorMessage(payload),
    });
  }

  const content = extractAssistantContent(payload.choices?.[0]?.message?.content);

  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage:
        'The self-hosted chat runtime returned an empty assistant response.',
    });
  }

  return {
    model: payload.model || params.model,
    content,
    thinking: payload.choices?.[0]?.message?.reasoning_content,
    usage: {
      promptTokens:
        typeof payload.usage?.prompt_tokens === 'number'
          ? payload.usage.prompt_tokens
          : null,
      completionTokens:
        typeof payload.usage?.completion_tokens === 'number'
          ? payload.usage.completion_tokens
          : null,
    },
  };
}
