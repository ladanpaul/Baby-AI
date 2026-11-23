import { loadKnowledgeContext } from '../utils/knowledge-files';
import {
  buildOpenAiCompatibleEndpoint,
  requestOpenAiCompatibleText,
  type OpenAiCompatibleTextMessage,
} from '../utils/openai-compatible';
import { defaultSystemPrompt } from '../utils/system-prompt';

type ChatRole = 'system' | 'user' | 'assistant';

interface IncomingChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequestBody {
  model?: string;
  systemPrompt?: string;
  messages?: IncomingChatMessage[];
  fileIds?: string[];
}

interface RuntimeChatResponse {
  model: string;
  content: string;
  thinking?: string;
  usage: {
    promptEvalCount: number | null;
    evalCount: number | null;
  };
}

const hostileLanguageNotice = 'Будь ласка, не спілкуйтеся ворожою мовою.';

function isChatRole(role: unknown): role is ChatRole {
  return role === 'system' || role === 'user' || role === 'assistant';
}

function sanitizeMessages(messages: unknown): IncomingChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message): message is IncomingChatMessage => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      const candidate = message as Record<string, unknown>;
      return isChatRole(candidate.role) && typeof candidate.content === 'string';
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length);
}

function sanitizeFileIds(fileIds: unknown): string[] {
  if (!Array.isArray(fileIds)) {
    return [];
  }

  return fileIds
    .filter((fileId): fileId is string => typeof fileId === 'string')
    .map((fileId) => fileId.trim())
    .filter((fileId) => fileId.length > 0);
}

function detectRussianLanguage(text: string): boolean {
  const normalized = text.toLowerCase();

  if (/[ыэёъ]/.test(normalized)) {
    return true;
  }

  return [
    'привет',
    'как тебя',
    'как дела',
    'что ',
    'это ',
    'тебя',
    'меня',
    'нужно',
    'можно',
    'сделай',
    'скажи',
    'пожалуйста',
  ].some((pattern) => normalized.includes(pattern));
}

function buildLanguageGuardPrompt(isRussianInput: boolean): string {
  if (!isRussianInput) {
    return '';
  }

  return [
    'Користувач звернувся російською мовою.',
    'Відповідай лише природною українською без російських слів.',
    `Наприкінці відповіді обовʼязково додай фразу: "${hostileLanguageNotice}"`,
  ].join('\n');
}

function ensureHostileLanguageNotice(content: string, isRussianInput: boolean): string {
  if (!isRussianInput) {
    return content;
  }

  if (content.includes(hostileLanguageNotice)) {
    return content;
  }

  return `${content}\n\n${hostileLanguageNotice}`;
}

function normalizeAssistantIdentity(content: string): string {
  return content.replace(/\b[Бб][еэ][йиії][бп][иі]\s+(?:AI|АІ|АИ)\b/g, 'Baby AI');
}

function stripAssistantLeadLabel(content: string): string {
  return content.replace(/^\s*(?:\*\*)?Baby AI(?:\*\*)?\s*[:：-]\s*/i, '');
}

function getLatestUserMessage(conversation: IncomingChatMessage[]): IncomingChatMessage | undefined {
  return [...conversation].reverse().find((message) => message.role === 'user');
}

function isIdentityQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return [
    'як тебе звати',
    'хто ти',
    'your name',
    'who are you',
    'what is your name',
    'как тебя зовут',
    'кто ты',
  ].some((pattern) => normalized.includes(pattern));
}

function buildMockAssistantContent(
  latestUserMessage: IncomingChatMessage | undefined,
  knowledgeFileNames: string[]
): string {
  const message = latestUserMessage?.content || '';
  const normalized = message.toLowerCase();

  if (!message) {
    return 'Я — Baby AI. У dev mock режимі я можу лише підтвердити, що чат-потік працює.';
  }

  if (
    normalized.includes('як тебе звати') ||
    normalized.includes('who are you') ||
    normalized.includes('your name')
  ) {
    return 'Я — Baby AI.';
  }

  if (
    normalized.includes('що ти вмієш') ||
    normalized.includes('what can you do')
  ) {
    const fileLine = knowledgeFileNames.length
      ? `Зараз у контексті підключено файли: ${knowledgeFileNames.join(', ')}.`
      : 'Зараз жоден файл не підключений до контексту.';

    return [
      'Зараз увімкнено dev mock runtime, тому це не справжня LLM-відповідь.',
      'Але чат-потік, файловий контекст і UI працюють.',
      fileLine,
      'Наступний крок — підключити реальний self-hosted chat backend.',
    ].join('\n\n');
  }

  const fileLine = knowledgeFileNames.length
    ? `Активні файли: ${knowledgeFileNames.join(', ')}.`
    : 'Активних файлів у контексті зараз немає.';

  return [
    'Зараз увімкнено dev mock runtime.',
    `Я отримав повідомлення: "${message}".`,
    fileLine,
    'Коли ми підключимо реальний OpenAI-compatible backend, тут буде відповідь від справжньої моделі.',
  ].join('\n\n');
}

function buildMockChatResponse(
  _model: string,
  conversation: IncomingChatMessage[],
  knowledgeFileNames: string[]
): RuntimeChatResponse {
  return {
    model: 'dev-mock',
    content: buildMockAssistantContent(
      getLatestUserMessage(conversation),
      knowledgeFileNames
    ),
    usage: {
      promptEvalCount: null,
      evalCount: null,
    },
  };
}

async function requestOpenAiCompatibleChat(params: {
  apiKey: string;
  endpoint: string;
  messages: OpenAiCompatibleTextMessage[];
  model: string;
}): Promise<RuntimeChatResponse> {
  const response = await requestOpenAiCompatibleText({
    apiKey: params.apiKey,
    endpoint: params.endpoint,
    messages: params.messages,
    model: params.model,
    temperature: 0.1,
  });

  return {
    model: response.model,
    content: response.content,
    thinking: response.thinking,
    usage: {
      promptEvalCount: response.usage.promptTokens,
      evalCount: response.usage.completionTokens,
    },
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<ChatRequestBody>(event);

  const systemPrompt = body.systemPrompt?.trim() || defaultSystemPrompt;
  const model = body.model?.trim() || config.chatModel;
  const conversation = sanitizeMessages(body.messages);
  const fileIds = sanitizeFileIds(body.fileIds);

  if (!conversation.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one chat message is required.',
    });
  }

  const knowledgeContext = await loadKnowledgeContext(fileIds);
  const latestUserMessage = getLatestUserMessage(conversation);
  const isRussianInput = latestUserMessage
    ? detectRussianLanguage(latestUserMessage.content)
    : false;

  if (latestUserMessage && isIdentityQuestion(latestUserMessage.content)) {
    return {
      model,
      message: {
        role: 'assistant' as const,
        content: ensureHostileLanguageNotice('Я — Baby AI.', isRussianInput),
      },
      usage: {
        totalDurationMs: null,
        promptEvalCount: null,
        evalCount: null,
      },
      knowledgeFiles: [],
    };
  }

  const resolvedSystemPrompt = [
    systemPrompt,
    buildLanguageGuardPrompt(isRussianInput),
    knowledgeContext.context,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n\n');

  const messages: OpenAiCompatibleTextMessage[] = resolvedSystemPrompt
    ? [{ role: 'system', content: resolvedSystemPrompt }, ...conversation]
    : conversation;

  const runtimeResponse =
    config.chatRuntimeMode === 'mock'
      ? buildMockChatResponse(
          model,
          conversation,
          knowledgeContext.files.map((file) => file.name)
        )
      : await requestOpenAiCompatibleChat({
          apiKey: config.chatApiKey,
          endpoint: buildOpenAiCompatibleEndpoint(
            config.chatApiBaseUrl,
            config.chatCompletionsPath
          ),
          messages,
          model,
        });

  return {
    model: runtimeResponse.model,
    message: {
      role: 'assistant' as const,
      content: stripAssistantLeadLabel(
        normalizeAssistantIdentity(
          ensureHostileLanguageNotice(runtimeResponse.content, isRussianInput)
        )
      ),
      thinking: runtimeResponse.thinking,
    },
    usage: {
      totalDurationMs: null,
      promptEvalCount: runtimeResponse.usage.promptEvalCount,
      evalCount: runtimeResponse.usage.evalCount,
    },
    knowledgeFiles: knowledgeContext.files.map((file) => file.name),
  };
});
