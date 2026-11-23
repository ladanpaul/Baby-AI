type ChatRole = 'user' | 'assistant' | 'system';
type ChatMessageKind = 'text' | 'image';

interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

interface ChatMessage extends ChatHistoryMessage {
  id: string;
  kind?: ChatMessageKind;
  imageUrl?: string;
  imagePrompt?: string;
  isPending?: boolean;
  meta?: string;
}

interface ChatUsage {
  totalDurationMs: number | null;
  promptEvalCount: number | null;
  evalCount: number | null;
}

interface KnowledgeFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  textChars: number;
  preview: string;
}

interface UploadFilesResponse {
  files: KnowledgeFile[];
  skipped: Array<{
    name: string;
    reason: string;
  }>;
}

interface ChatResponse {
  model: string;
  message: {
    role: 'assistant';
    content: string;
    thinking?: string;
  };
  usage: ChatUsage;
  knowledgeFiles: string[];
}

interface ImageGenerationResponse {
  prompt: string;
  modelId: string;
  device: string;
  durationMs: number | null;
  width: number;
  height: number;
  mimeType: string;
  imageBase64: string;
}

interface ImageIntent {
  isImageRequest: boolean;
  normalizedPrompt: string;
  needsClarification: boolean;
}

interface IntentRouteResponse {
  intent: 'chat' | 'image' | 'clarify-image';
  imagePrompt?: string;
  progressMessage?: string;
  clarification?: string;
}

interface ResolvedRequestIntent {
  kind: 'text' | 'image' | 'clarify-image';
  normalizedPrompt: string;
  progressMessage: string;
  clarification: string;
}

interface ImagePlanResponse {
  status: 'ready' | 'clarify';
  promptEn: string;
  clarification: string;
  summaryUk: string;
  brief: {
    subject?: string;
    composition?: string;
    environment?: string;
    lighting?: string;
    camera?: string;
    style?: string;
    keyDetails?: string[];
    avoid?: string[];
  };
}

function getLastAssistantImagePrompt(messages: ChatMessage[]): string {
  return (
    [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.kind === 'image' && message.imagePrompt)
      ?.imagePrompt?.trim() || ''
  );
}

const boundaryPattern = '[\\s,.:;!?()\\[\\]{}"\'`\\-–—]';
const strongImageVerbPattern = new RegExp(
  `(?:^|${boundaryPattern})(згенеруй|намалюй|зрендери|рендерни|generate|draw|render|illustrate|sketch)(?=$|${boundaryPattern})`,
  'iu'
);
const weakImageVerbPattern = new RegExp(
  `(?:^|${boundaryPattern})(створи|зроби|покажи|create|make|show)(?=$|${boundaryPattern})`,
  'iu'
);
const imageNounPattern = new RegExp(
  `(?:^|${boundaryPattern})(фото|фотку|фотографію|картинку|картину|зображення|ілюстрацію|ілюстрація|арт|артворк|рендер|постер|логотип|лого|аватар|шпалери|банер|ескіз|малюнок|image|photo|picture|illustration|artwork|render|poster|logo|avatar|wallpaper|portrait|shot)(?=$|${boundaryPattern})`,
  'iu'
);
const visualHintPattern = new RegExp(
  `(?:^|${boundaryPattern})(кінематографічн|cinematic|photoreal|реалістичн|портрет|portrait|full[- ]?frame|nikon|canon|lens|об'єктив|обєктив|camera|lighting|studio|golden hour|золотий час|bokeh|wide[- ]?angle|telephoto|35mm|50mm|85mm|raw)(?=$|${boundaryPattern})`,
  'iu'
);
const textTaskPattern = new RegExp(
  `(?:^|${boundaryPattern})(текст|лист|email|e-mail|план|strategy|стратег|код|code|regex|регекс|function|component|компонент|sql|json|yaml|документ|document|article|статт|переклад|translate|translation|таблиц|table|query|запит)(?=$|${boundaryPattern})`,
  'iu'
);
const politePrefixPattern = new RegExp(
  `^(?:привіт|вітаю|hello|hey|hi|yo|доброго дня|добрий день)${boundaryPattern}+`,
  'iu'
);
const politeWordPattern = new RegExp(
  `(?:^|${boundaryPattern})(будь ласка|будь-ласка|please|pls|можеш|can you|could you)(?=$|${boundaryPattern})`,
  'iu'
);
const commandLeadPattern = new RegExp(
  `^(згенеруй|намалюй|зрендери|рендерни|generate|draw|render|illustrate|sketch|створи|зроби|покажи|create|make|show)${boundaryPattern}*`,
  'iu'
);
const genericImageOnlyPattern = new RegExp(
  `^(фото|фотку|фотографію|картинку|картину|зображення|ілюстрацію|ілюстрація|арт|артворк|рендер|image|photo|picture|illustration|artwork|render|poster|logo|avatar|wallpaper|portrait)s?$`,
  'iu'
);
const conversationalLeadPattern = new RegExp(
  `^(мені треба|мені потрібн[ао]|хочу|я хочу|i want|i need|need|want|for me|please give me|show me|you to)${boundaryPattern}+`,
  'iu'
);
const starterMediaNounPattern = new RegExp(
  `^(фото|фотку|фотографію|картинку|картину|зображення|ілюстрацію|ілюстрація|арт|артворк|рендер|poster|logo|avatar|wallpaper|portrait|image|photo|picture|illustration|artwork|render|shot)${boundaryPattern}+`,
  'iu'
);
const conversationalTailPattern =
  /\s+(дякую|thanks|thank you|thx|дякс|if you can|if possible|якщо можеш|якщо вийде)\s*$/iu;
const quoteEdgePattern = /^[«“"'`]+|[»”"'`]+$/gu;
const trailingPunctuationPattern = /[\s,;:.-]+$/u;
const leadingMediaDescriptorPattern =
  /^(фото|фотку|фотографію|картинку|картину|зображення|ілюстрацію|ілюстрація|арт|артворк|рендер|poster|logo|avatar|wallpaper|portrait|image|photo|picture|illustration|artwork|render|shot)\s+/iu;

function parseImageIntent(content: string): ImageIntent {
  const trimmed = content.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized.startsWith('/image ')) {
    const imagePrompt = trimmed.slice('/image '.length).trim();

    return {
      isImageRequest: true,
      normalizedPrompt: imagePrompt,
      needsClarification: imagePrompt.length === 0,
    };
  }

  const hasStrongVerb = strongImageVerbPattern.test(normalized);
  const hasWeakVerb = weakImageVerbPattern.test(normalized);
  const hasImageNoun = imageNounPattern.test(normalized);
  const hasVisualHint = visualHintPattern.test(normalized);
  const hasTextTask = textTaskPattern.test(normalized);

  const score =
    (hasStrongVerb ? 2 : 0) +
    (hasWeakVerb ? 1 : 0) +
    (hasImageNoun ? 2 : 0) +
    (hasVisualHint ? 1 : 0) -
    (hasTextTask ? 2 : 0);

  const isImageRequest =
    score >= 2 &&
    !(hasTextTask && !hasImageNoun && !hasVisualHint && !hasStrongVerb);

  if (!isImageRequest) {
    return {
      isImageRequest: false,
      normalizedPrompt: trimmed,
      needsClarification: false,
    };
  }

  const commandMatch = normalized.match(strongImageVerbPattern) || normalized.match(weakImageVerbPattern);
  let cleanedPrompt = trimmed.replace(politePrefixPattern, '').trim();

  if (commandMatch?.[1]) {
    const command = commandMatch[1];
    const commandIndex = normalized.indexOf(command.toLowerCase());

    if (commandIndex >= 0) {
      cleanedPrompt = trimmed.slice(commandIndex + command.length).trim();
    }
  }

  cleanedPrompt = cleanedPrompt
    .replace(politeWordPattern, ' ')
    .replace(commandLeadPattern, '')
    .replace(conversationalLeadPattern, '')
    .replace(starterMediaNounPattern, '')
    .replace(/\s+(if you can|if possible|якщо можеш|якщо вийде)\s*$/iu, '')
    .replace(conversationalTailPattern, '')
    .replace(/\s+/g, ' ')
    .replace(quoteEdgePattern, '')
    .trim();

  cleanedPrompt = cleanedPrompt
    .replace(/^(me)\s+/iu, '')
    .replace(/^(створити|зробити|показати|create|make|show)\s+/iu, '')
    .replace(/\s+якщо\s*$/iu, '')
    .replace(trailingPunctuationPattern, '')
    .trim();

  const needsClarification =
    cleanedPrompt.length === 0 ||
    genericImageOnlyPattern.test(cleanedPrompt) ||
    cleanedPrompt.replace(/[.!?,:;'"`]/g, '').trim().length < 3;

  return {
    isImageRequest: true,
    normalizedPrompt: cleanedPrompt,
    needsClarification,
  };
}

function buildImageProgressMessage(prompt: string): string {
  const cleanedSubject = prompt
    .replace(leadingMediaDescriptorPattern, '')
    .replace(trailingPunctuationPattern, '')
    .trim();

  if (!cleanedSubject) {
    return 'Генерую зображення за твоїм описом.';
  }

  const words = cleanedSubject.split(/\s+/).filter(Boolean);
  const shortSubject = words
    .slice(0, 7)
    .join(' ')
    .replace(trailingPunctuationPattern, '')
    .trim();

  if (!shortSubject) {
    return 'Генерую зображення за твоїм описом.';
  }

  return words.length > 7
    ? `Генерую зображення: ${shortSubject} по заданих критеріях.`
    : `Генерую зображення: ${shortSubject}.`;
}

function mapHeuristicIntent(content: string): ResolvedRequestIntent {
  const imageIntent = parseImageIntent(content);

  if (!imageIntent.isImageRequest) {
    return {
      kind: 'text',
      normalizedPrompt: content.trim(),
      progressMessage: '',
      clarification: '',
    };
  }

  if (imageIntent.needsClarification) {
    return {
      kind: 'clarify-image',
      normalizedPrompt: imageIntent.normalizedPrompt,
      progressMessage: '',
      clarification:
        'Уточни, будь ласка, що саме ти хочеш згенерувати: обʼєкт, стиль, ракурс, освітлення або інші деталі.',
    };
  }

  return {
    kind: 'image',
    normalizedPrompt: imageIntent.normalizedPrompt,
    progressMessage: buildImageProgressMessage(imageIntent.normalizedPrompt),
    clarification: '',
  };
}

function buildAssistantMeta(model: string, usage: ChatUsage): string {
  const parts: string[] = [model];

  if (usage.totalDurationMs !== null) {
    parts.push(`${usage.totalDurationMs} ms`);
  }

  if (usage.evalCount !== null) {
    parts.push(`${usage.evalCount} output tok`);
  }

  if (usage.promptEvalCount !== null) {
    parts.push(`${usage.promptEvalCount} prompt tok`);
  }

  return parts.join(' · ');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'The request failed before Baby AI could answer.';
}

export function useBabyAiChat() {
  const config = useRuntimeConfig();
  const defaultModel = config.public.defaultModel || 'gpt-oss-20b';

  const draft = useState('baby-ai-draft', () => '');
  const model = useState('baby-ai-model', () => defaultModel);
  const messages = useState<ChatMessage[]>('baby-ai-messages', () => []);
  const knowledgeFiles = useState<KnowledgeFile[]>('baby-ai-knowledge-files', () => []);
  const activeKnowledgeFileIds = useState<string[]>(
    'baby-ai-active-knowledge-file-ids',
    () => []
  );
  const hasLoadedKnowledgeFiles = useState('baby-ai-has-loaded-knowledge-files', () => false);
  const uploadNotice = useState<string | null>('baby-ai-upload-notice', () => null);
  const error = useState<string | null>('baby-ai-error', () => null);
  const isSending = ref(false);
  const isUploadingFiles = ref(false);
  const activeRequestKind = ref<ChatMessageKind | null>(null);

  const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

  async function resolveRequestIntent(
    content: string,
    previousMessages: ChatMessage[]
  ): Promise<ResolvedRequestIntent> {
    const heuristicIntent = mapHeuristicIntent(content);
    const previousImagePrompt = getLastAssistantImagePrompt(previousMessages);

    if (config.public.chatRuntimeMode === 'mock') {
      return heuristicIntent;
    }

    try {
      const response = await $fetch<IntentRouteResponse>('/api/intent', {
        method: 'POST',
        body: {
          content,
          previousImagePrompt,
        },
      });

      if (
        heuristicIntent.kind === 'clarify-image' &&
        response.intent === 'image'
      ) {
        return heuristicIntent;
      }

      if (heuristicIntent.kind === 'image' && response.intent === 'chat') {
        return heuristicIntent;
      }

      if (response.intent === 'image') {
        const plannerResponse = await $fetch<ImagePlanResponse>('/api/image-plan', {
          method: 'POST',
          body: {
            content,
            previousImagePrompt,
          },
        });

        if (plannerResponse.status === 'clarify') {
          return {
            kind: 'clarify-image',
            normalizedPrompt: '',
            progressMessage: '',
            clarification:
              plannerResponse.clarification?.trim() ||
              'Уточни, будь ласка, що саме ти хочеш згенерувати.',
          };
        }

        const normalizedPrompt =
          plannerResponse.promptEn?.trim() ||
          response.imagePrompt?.trim() ||
          heuristicIntent.normalizedPrompt;

        if (!normalizedPrompt) {
          return heuristicIntent;
        }

        return {
          kind: 'image',
          normalizedPrompt,
          progressMessage:
            plannerResponse.summaryUk?.trim() ||
            (heuristicIntent.kind === 'image'
              ? heuristicIntent.progressMessage
              : buildImageProgressMessage(normalizedPrompt)),
          clarification: '',
        };
      }

      if (response.intent === 'clarify-image') {
        return {
          kind: 'clarify-image',
          normalizedPrompt: '',
          progressMessage: '',
          clarification:
            response.clarification?.trim() ||
            heuristicIntent.clarification ||
            'Уточни, будь ласка, що саме ти хочеш згенерувати.',
        };
      }

      return {
        kind: 'text',
        normalizedPrompt: content.trim(),
        progressMessage: '',
        clarification: '',
      };
    } catch {
      return heuristicIntent;
    }
  }

  function mergeKnowledgeFiles(nextFiles: KnowledgeFile[]) {
    const byId = new Map(knowledgeFiles.value.map((file) => [file.id, file]));

    for (const file of nextFiles) {
      byId.set(file.id, file);
    }

    knowledgeFiles.value = [...byId.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  async function loadKnowledgeFiles(force = false) {
    if (hasLoadedKnowledgeFiles.value && !force) {
      return;
    }

    try {
      const response = await $fetch<{ files: KnowledgeFile[] }>('/api/files');
      knowledgeFiles.value = response.files;

      const availableIds = new Set(response.files.map((file) => file.id));
      const currentActiveIds = activeKnowledgeFileIds.value.filter((id) => availableIds.has(id));

      activeKnowledgeFileIds.value = currentActiveIds.length
        ? currentActiveIds
        : response.files.map((file) => file.id);

      hasLoadedKnowledgeFiles.value = true;
    } catch (requestError) {
      error.value = getErrorMessage(requestError);
    }
  }

  async function uploadKnowledgeFiles(inputFiles: FileList | File[]) {
    const files = Array.from(inputFiles);

    if (!files.length || isUploadingFiles.value) {
      return;
    }

    const formData = new FormData();

    for (const file of files) {
      formData.append('files', file);
    }

    uploadNotice.value = null;
    error.value = null;
    isUploadingFiles.value = true;

    try {
      const response = await $fetch<UploadFilesResponse>('/api/files', {
        method: 'POST',
        body: formData,
      });

      mergeKnowledgeFiles(response.files);

      const nextActiveIds = new Set(activeKnowledgeFileIds.value);

      for (const file of response.files) {
        nextActiveIds.add(file.id);
      }

      activeKnowledgeFileIds.value = [...nextActiveIds];
      uploadNotice.value = response.skipped.length
        ? response.skipped.map((entry) => `${entry.name}: ${entry.reason}`).join(' ')
        : null;
    } catch (requestError) {
      error.value = getErrorMessage(requestError);
    } finally {
      isUploadingFiles.value = false;
    }
  }

  function toggleKnowledgeFile(fileId: string) {
    if (activeKnowledgeFileIds.value.includes(fileId)) {
      activeKnowledgeFileIds.value = activeKnowledgeFileIds.value.filter((id) => id !== fileId);
      return;
    }

    activeKnowledgeFileIds.value = [...activeKnowledgeFileIds.value, fileId];
  }

  async function sendMessage() {
    const content = draft.value.trim();

    if (!content || isSending.value) {
      return;
    }

    const previousMessages = [...messages.value];
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    const history: ChatHistoryMessage[] = [
      ...previousMessages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content },
    ];

    error.value = null;
    isSending.value = true;
    draft.value = '';
    messages.value = [...previousMessages, userMessage];

    try {
      const resolvedIntent = await resolveRequestIntent(content, previousMessages);
      activeRequestKind.value = resolvedIntent.kind === 'image' ? 'image' : 'text';

      if (resolvedIntent.kind === 'clarify-image') {
          const clarificationMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: resolvedIntent.clarification,
          };

          messages.value = [...previousMessages, userMessage, clarificationMessage];
          return;
      }

      if (resolvedIntent.kind === 'image') {

        const pendingAssistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          kind: 'image',
          content: resolvedIntent.progressMessage,
          imagePrompt: resolvedIntent.normalizedPrompt,
          isPending: true,
        };

        messages.value = [...previousMessages, userMessage, pendingAssistantMessage];

        const response = await $fetch<ImageGenerationResponse>('/api/images', {
          method: 'POST',
          body: {
            prompt: resolvedIntent.normalizedPrompt,
          },
        });

        const assistantImageMessage: ChatMessage = {
          id: pendingAssistantMessage.id,
          role: 'assistant',
          kind: 'image',
          content: pendingAssistantMessage.content,
          imagePrompt: response.prompt,
          imageUrl: `data:${response.mimeType};base64,${response.imageBase64}`,
          meta: [
            response.modelId,
            response.durationMs !== null ? `${response.durationMs} ms` : '',
            `${response.width}x${response.height}`,
            response.device,
          ]
            .filter(Boolean)
            .join(' · '),
        };

        messages.value = [...previousMessages, userMessage, assistantImageMessage];
        return;
      }

      const response = await $fetch<ChatResponse>('/api/chat', {
        method: 'POST',
        body: {
          model: model.value,
          messages: history,
          fileIds: activeKnowledgeFileIds.value,
        },
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message.content,
        meta: [
          buildAssistantMeta(response.model, response.usage),
          response.knowledgeFiles.length ? `${response.knowledgeFiles.length} file${response.knowledgeFiles.length === 1 ? '' : 's'}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      };

      messages.value = [...previousMessages, userMessage, assistantMessage];
    } catch (requestError) {
      messages.value = previousMessages;
      draft.value = content;
      error.value = getErrorMessage(requestError);
    } finally {
      isSending.value = false;
      activeRequestKind.value = null;
    }
  }

  function resetChat() {
    messages.value = [];
    draft.value = '';
    error.value = null;
  }

  return {
    activeKnowledgeFileIds,
    canSend,
    draft,
    error,
    activeRequestKind,
    isSending,
    isUploadingFiles,
    knowledgeFiles,
    loadKnowledgeFiles,
    messages,
    model,
    resetChat,
    sendMessage,
    toggleKnowledgeFile,
    uploadKnowledgeFiles,
    uploadNotice,
  };
}
